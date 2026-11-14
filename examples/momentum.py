"""A transparent demonstration strategy, not a profitability recommendation."""

def decide(observation):
    candles = observation["candles"]
    change = (int(candles[-1]["close"]) / int(candles[0]["close"]) - 1) * 10000
    held = int(observation["position"]["quantity"]) > 0
    action = "BUY" if change > 100 and not held else "SELL" if change < -100 and held else "HOLD"
    target = 10000 if action == "BUY" or (action == "HOLD" and held) else 0
    return {"action": action, "target_bps": target, "reason": "Momentum rule"}
