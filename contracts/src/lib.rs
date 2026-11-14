//! NEAR testnet research prototype. Not independently audited.
//! Operator-attested reports; cryptographic hashes do not prove performance truth.
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U128, U64};

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Version { pub owner: AccountId, pub terms_hash: String }
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Job {
    pub buyer: AccountId, pub version_hash: String, pub manifest_hash: String,
    pub report_hash: String, pub deposit: U128, pub charged: U128, pub completed_steps: u32,
    pub requested_steps: u32, pub state: u8, pub canceled: bool, pub expires_ns: U64,
    pub settlement_nonce: String,
}
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Listing { pub seller: AccountId, pub version_hash: String, pub report_hash: String, pub terms_hash: String, pub price: U128 }
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct License { pub buyer: AccountId, pub listing_id: String, pub version_hash: String, pub terms_hash: String }
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Pending { pub amount: U128, pub nonce: U64 }
#[near(serializers = [json])]
pub struct Liabilities { pub escrow: U128, pub credits: U128, pub pending: U128 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AgentProof {
    operator: AccountId,
    versions: LookupMap<String, Version>, jobs: LookupMap<String, Job>,
    listings: LookupMap<String, Listing>, licenses: LookupMap<String, License>,
    credits: LookupMap<AccountId, U128>, pending: LookupMap<AccountId, Pending>,
    sequence: u64, escrow_total: u128, credit_total: u128, pending_total: u128,
}

#[near]
impl AgentProof {
    #[init]
    pub fn new(operator: AccountId) -> Self {
        // Self initialization prevents takeover between deployment and initialization.
        require!(env::predecessor_account_id() == env::current_account_id(), "SELF_INIT_ONLY");
        let mut c = Self { operator: operator.clone(), versions: LookupMap::new(b"v"), jobs: LookupMap::new(b"j"),
            listings: LookupMap::new(b"l"), licenses: LookupMap::new(b"e"), credits: LookupMap::new(b"c"), pending: LookupMap::new(b"p"),
            sequence: 0, escrow_total: 0, credit_total: 0, pending_total: 0 };
        c.ensure_account(&operator); c
    }

    #[payable]
    pub fn register_version(&mut self, version_hash: String, terms_hash: String) {
        Self::valid_hash(&version_hash); Self::valid_hash(&terms_hash);
        require!(self.versions.get(&version_hash).is_none(), "VERSION_EXISTS");
        let before = env::storage_usage(); let owner = env::predecessor_account_id(); self.ensure_account(&owner);
        self.versions.insert(&version_hash, &Version { owner: owner.clone(), terms_hash });
        self.cover_storage(before, 0, &owner);
    }

    #[payable]
    pub fn fund_job(&mut self, job_id: String, version_hash: String, manifest_hash: String, service_deposit: U128, requested_steps: u32) {
        Self::valid_id(&job_id); Self::valid_hash(&manifest_hash);
        require!(self.versions.get(&version_hash).is_some(), "VERSION_NOT_FOUND");
        require!(self.jobs.get(&job_id).is_none(), "JOB_EXISTS");
        require!(service_deposit.0 > 0 && requested_steps > 0 && requested_steps <= 10000, "INVALID_JOB");
        let before = env::storage_usage(); let buyer = env::predecessor_account_id(); self.ensure_account(&buyer);
        self.jobs.insert(&job_id, &Job { buyer: buyer.clone(), version_hash, manifest_hash,
            report_hash: "0".repeat(64), deposit: service_deposit, charged: U128(0), completed_steps: 0,
            requested_steps, state: 0, canceled: false, expires_ns: U64(env::block_timestamp().checked_add(86_400_000_000_000).unwrap()),
            settlement_nonce: "0".repeat(64) });
        self.escrow_total = self.escrow_total.checked_add(service_deposit.0).unwrap();
        self.cover_storage(before, service_deposit.0, &buyer);
    }

    pub fn commit_result(&mut self, job_id: String, manifest_hash: String, report_hash: String, completed_steps: u32) {
        self.only_operator(); Self::valid_hash(&report_hash);
        let mut job = self.jobs.get(&job_id).expect("JOB_NOT_FOUND");
        require!(job.manifest_hash == manifest_hash && job.state == 0, "MANIFEST_OR_STATE_MISMATCH");
        require!(completed_steps <= job.requested_steps, "INVALID_COMPLETION");
        job.report_hash = report_hash; job.completed_steps = completed_steps; job.state = 1; self.jobs.insert(&job_id, &job);
    }

    pub fn settle_job(&mut self, job_id: String, charge: U128, settlement_nonce: String) {
        self.only_operator(); Self::valid_hash(&settlement_nonce);
        let mut job = self.jobs.get(&job_id).expect("JOB_NOT_FOUND");
        if job.state == 2 { require!(job.settlement_nonce == settlement_nonce && job.charged == charge, "ALREADY_SETTLED"); return; }
        require!(job.state == 1 && charge.0 <= job.deposit.0, "OVERCHARGE_OR_NO_REPORT");
        job.state = 2; job.charged = charge; job.settlement_nonce = settlement_nonce;
        self.escrow_total -= job.deposit.0;
        self.credit(&job.buyer, job.deposit.0 - charge.0); self.credit(&self.operator.clone(), charge.0);
        self.jobs.insert(&job_id, &job);
    }

    pub fn request_cancel(&mut self, job_id: String) {
        let mut job = self.jobs.get(&job_id).expect("JOB_NOT_FOUND");
        require!(job.buyer == env::predecessor_account_id() && job.state < 2, "NOT_CANCELABLE");
        job.canceled = true; self.jobs.insert(&job_id, &job);
        // Cancellation does not erase the cost of an already sent provider request.
    }

    pub fn expire_job(&mut self, job_id: String) {
        let mut job = self.jobs.get(&job_id).expect("JOB_NOT_FOUND");
        require!(job.buyer == env::predecessor_account_id(), "NOT_BUYER");
        require!(job.state < 2 && env::block_timestamp() >= job.expires_ns.0, "NOT_EXPIRED");
        self.escrow_total -= job.deposit.0; self.credit(&job.buyer, job.deposit.0);
        job.state = 2; job.canceled = true; self.jobs.insert(&job_id, &job);
    }

    #[payable]
    pub fn create_listing(&mut self, listing_id: String, job_id: String, expected_version_hash: String, price: U128) {
        Self::valid_id(&listing_id); require!(price.0 > 0, "ZERO_PRICE");
        require!(self.listings.get(&listing_id).is_none(), "LISTING_EXISTS");
        let job = self.jobs.get(&job_id).expect("JOB_NOT_FOUND");
        require!(job.state >= 1 && job.completed_steps > 0 && job.version_hash == expected_version_hash, "VERSION_OR_REPORT_MISMATCH");
        let version = self.versions.get(&job.version_hash).expect("VERSION_NOT_FOUND"); let seller = env::predecessor_account_id();
        require!(version.owner == seller, "NOT_VERSION_OWNER");
        let before = env::storage_usage();
        self.listings.insert(&listing_id, &Listing { seller: seller.clone(), version_hash: job.version_hash,
            report_hash: job.report_hash, terms_hash: version.terms_hash, price });
        self.cover_storage(before, 0, &seller);
    }

    #[payable]
    pub fn purchase_license(&mut self, listing_id: String, expected_version_hash: String, expected_terms_hash: String) -> License {
        let item = self.listings.get(&listing_id).expect("LISTING_NOT_FOUND");
        require!(item.version_hash == expected_version_hash && item.terms_hash == expected_terms_hash, "VERSION_OR_TERMS_MISMATCH");
        let buyer = env::predecessor_account_id(); let key = format!("{}:{}", buyer, listing_id);
        // A duplicate attached payment is rejected atomically, not charged again.
        require!(self.licenses.get(&key).is_none(), "ALREADY_LICENSED");
        let before = env::storage_usage(); self.ensure_account(&buyer);
        let license = License { buyer: buyer.clone(), listing_id, version_hash: item.version_hash, terms_hash: item.terms_hash };
        self.licenses.insert(&key, &license);
        self.cover_storage(before, item.price.0, &buyer); self.credit(&item.seller, item.price.0);
        license
    }

    #[payable]
    pub fn withdraw_credit(&mut self) -> Promise {
        near_sdk::assert_one_yocto();
        let buyer = env::predecessor_account_id(); let amount = self.credits.get(&buyer).expect("NO_CREDIT").0;
        let previous = self.pending.get(&buyer).expect("NO_ACCOUNT");
        require!(amount > 0 && previous.amount.0 == 0, "NOT_WITHDRAWABLE");
        self.sequence = self.sequence.checked_add(1).unwrap(); let nonce = self.sequence;
        self.credits.insert(&buyer, &U128(0)); self.credit_total -= amount; self.pending_total += amount;
        self.pending.insert(&buyer, &Pending { amount: U128(amount), nonce: U64(nonce) });
        Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(amount)).then(
            Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_withdraw(buyer, U64(nonce)))
    }

    #[private]
    pub fn on_withdraw(&mut self, buyer: AccountId, nonce: U64) -> bool {
        require!(env::promise_results_count() == 1, "EXPECTED_ONE_RESULT");
        let pending = self.pending.get(&buyer).expect("NO_PENDING_TRANSFER");
        require!(pending.nonce == nonce, "NONCE_MISMATCH");
        if pending.amount.0 == 0 { return false; }
        let success = env::promise_result_checked(0, 0).is_ok();
        self.pending_total -= pending.amount.0;
        if !success { self.credit(&buyer, pending.amount.0); }
        self.pending.insert(&buyer, &Pending { amount: U128(0), nonce }); success
    }

    pub fn get_job(&self, job_id: String) -> Option<Job> { self.jobs.get(&job_id) }
    pub fn get_version(&self, version_hash: String) -> Option<Version> { self.versions.get(&version_hash) }
    pub fn get_listing(&self, listing_id: String) -> Option<Listing> { self.listings.get(&listing_id) }
    pub fn get_license(&self, buyer: AccountId, listing_id: String) -> Option<License> { self.licenses.get(&format!("{}:{}", buyer, listing_id)) }
    pub fn get_credit(&self, account: AccountId) -> U128 { self.credits.get(&account).unwrap_or(U128(0)) }
    pub fn get_liabilities(&self) -> Liabilities { Liabilities { escrow: U128(self.escrow_total), credits: U128(self.credit_total), pending: U128(self.pending_total) } }
}

impl AgentProof {
    fn only_operator(&self) { require!(env::predecessor_account_id() == self.operator, "OPERATOR_ONLY"); }
    fn valid_hash(h: &str) { require!(h.len() == 64 && h.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)), "INVALID_HASH"); }
    fn valid_id(s: &str) { require!(!s.is_empty() && s.len() <= 80 && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'), "INVALID_ID"); }
    fn ensure_account(&mut self, account: &AccountId) {
        if self.credits.get(account).is_none() { self.credits.insert(account, &U128(0)); self.pending.insert(account, &Pending { amount: U128(0), nonce: U64(0) }); }
    }
    fn credit(&mut self, account: &AccountId, amount: u128) {
        let old = self.credits.get(account).expect("ACCOUNT_NOT_REGISTERED");
        self.credits.insert(account, &U128(old.0.checked_add(amount).unwrap())); self.credit_total = self.credit_total.checked_add(amount).unwrap();
    }
    fn cover_storage(&mut self, before: u64, service_amount: u128, payer: &AccountId) {
        let storage = u128::from(env::storage_usage().saturating_sub(before)).checked_mul(env::storage_byte_cost().as_yoctonear()).unwrap();
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= service_amount.checked_add(storage).unwrap(), "SERVICE_PLUS_STORAGE_REQUIRED");
        // Storage and service deposits are separate; excess becomes withdrawable credit.
        self.credit(payer, attached - service_amount - storage);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{testing_env, test_utils::VMContextBuilder, PromiseResult};
    fn account(name: &str) -> AccountId { name.parse().unwrap() }
    fn context(who: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new().current_account_id(account("proof.testnet"))
            .predecessor_account_id(account(who)).signer_account_id(account(who))
            .attached_deposit(NearToken::from_yoctonear(deposit)).account_balance(NearToken::from_near(100)).build());
    }
    fn funded() -> AgentProof {
        context("proof.testnet", 0); let mut c = AgentProof::new(account("operator.testnet"));
        context("seller.testnet", 10u128.pow(24)); c.register_version("a".repeat(64), "b".repeat(64));
        context("buyer.testnet", 2 * 10u128.pow(24)); c.fund_job("job-1".into(), "a".repeat(64), "c".repeat(64), U128(10u128.pow(24)), 20); c
    }
    #[test]
    fn settles_once_without_changing_total_liability() {
        let mut c = funded(); let before = c.escrow_total + c.credit_total;
        context("operator.testnet", 0); c.commit_result("job-1".into(), "c".repeat(64), "d".repeat(64), 10);
        c.settle_job("job-1".into(), U128(100), "e".repeat(64)); c.settle_job("job-1".into(), U128(100), "e".repeat(64));
        assert_eq!(before, c.escrow_total + c.credit_total); assert_eq!(c.escrow_total, 0);
    }
    #[test]
    #[should_panic(expected = "OVERCHARGE_OR_NO_REPORT")]
    fn rejects_charge_above_deposit() {
        let mut c = funded(); context("operator.testnet", 0);
        c.commit_result("job-1".into(), "c".repeat(64), "d".repeat(64), 10);
        c.settle_job("job-1".into(), U128(10u128.pow(24) + 1), "e".repeat(64));
    }
    #[test]
    #[should_panic(expected = "VERSION_OR_REPORT_MISMATCH")]
    fn rejects_different_version_listing() {
        let mut c = funded(); context("operator.testnet", 0);
        c.commit_result("job-1".into(), "c".repeat(64), "d".repeat(64), 10);
        context("seller.testnet", 10u128.pow(24)); c.create_listing("listing-1".into(), "job-1".into(), "f".repeat(64), U128(100));
    }
    fn listed() -> AgentProof {
        let mut c = funded(); context("operator.testnet", 0);
        c.commit_result("job-1".into(), "c".repeat(64), "d".repeat(64), 10);
        context("seller.testnet", 10u128.pow(24));
        c.create_listing("listing-1".into(), "job-1".into(), "a".repeat(64), U128(100)); c
    }
    #[test]
    #[should_panic(expected = "OPERATOR_ONLY")]
    fn buyer_cannot_attest_own_result() { let mut c=funded(); context("buyer.testnet",0); c.commit_result("job-1".into(),"c".repeat(64),"d".repeat(64),20); }
    #[test]
    #[should_panic(expected = "NOT_VERSION_OWNER")]
    fn buyer_cannot_list_creators_version() { let mut c=funded(); context("operator.testnet",0); c.commit_result("job-1".into(),"c".repeat(64),"d".repeat(64),20); context("buyer.testnet",10u128.pow(24)); c.create_listing("stolen".into(),"job-1".into(),"a".repeat(64),U128(100)); }
    #[test]
    #[should_panic(expected = "VERSION_OR_TERMS_MISMATCH")]
    fn purchase_rejects_changed_terms() { let mut c=listed(); context("buyer.testnet",10u128.pow(24)); c.purchase_license("listing-1".into(),"a".repeat(64),"f".repeat(64)); }
    #[test]
    #[should_panic(expected = "ALREADY_LICENSED")]
    fn duplicate_purchase_is_rejected() { let mut c=listed(); context("buyer.testnet",10u128.pow(24)); c.purchase_license("listing-1".into(),"a".repeat(64),"b".repeat(64)); c.purchase_license("listing-1".into(),"a".repeat(64),"b".repeat(64)); }
    #[test]
    fn purchase_binds_version_and_credits_seller() {
        let mut c=listed();let before=c.get_credit(account("seller.testnet")).0;context("buyer.testnet",10u128.pow(24));
        let license=c.purchase_license("listing-1".into(),"a".repeat(64),"b".repeat(64));
        assert_eq!(license.version_hash,"a".repeat(64));assert_eq!(c.get_credit(account("seller.testnet")).0,before+100);
    }
    #[test]
    fn cancellation_preserves_escrow_until_expiry() {
        let mut c=funded();context("buyer.testnet",0);c.request_cancel("job-1".into());assert_eq!(c.escrow_total,10u128.pow(24));
        testing_env!(VMContextBuilder::new().current_account_id(account("proof.testnet")).predecessor_account_id(account("buyer.testnet")).block_timestamp(86_400_000_000_001).build());
        let before=c.get_credit(account("buyer.testnet")).0;c.expire_job("job-1".into());assert_eq!(c.escrow_total,0);assert_eq!(c.get_credit(account("buyer.testnet")).0,before+10u128.pow(24));
    }
    #[test]
    #[allow(deprecated)]
    fn failed_withdrawal_restores_credit_once() {
        let mut c=listed();let buyer=account("seller.testnet");let original=c.get_credit(buyer.clone()).0;
        context("seller.testnet",1);let _ = c.withdraw_credit();assert_eq!(c.get_credit(buyer.clone()).0,0);let nonce=c.pending.get(&buyer).unwrap().nonce;
        let ctx=VMContextBuilder::new().current_account_id(account("proof.testnet")).predecessor_account_id(account("proof.testnet")).build();
        near_sdk::test_utils::testing_env_with_promise_results(ctx,PromiseResult::Failed);
        assert!(!c.on_withdraw(buyer.clone(),nonce));assert_eq!(c.get_credit(buyer.clone()).0,original);
        assert!(!c.on_withdraw(buyer.clone(),nonce));assert_eq!(c.get_credit(buyer).0,original);assert_eq!(c.pending_total,0);
    }
}
