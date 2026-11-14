const response = await fetch('http://127.0.0.1:4317/api/health', {
  headers: {'x-prooflot-gateway':process.env.PROOFLOT_GATEWAY_SECRET || ''},
  signal:AbortSignal.timeout(2000)
}).catch(()=>null);
process.exitCode=response?.ok?0:1;
