import { pathToFileURL } from 'node:url';
import {
  checkProductionReadiness,
  recordProductionReadinessReport,
} from '../services/productionReadiness.js';

function parseArgs(argv) {
  const options = { live: false };
  for (const arg of argv) {
    if (arg === '--live') options.live = true;
    else if (arg.startsWith('--date=')) options.date = arg.slice('--date='.length);
    else throw new Error(`unknown_argument:${arg}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const checked = await checkProductionReadiness(options);
  const report = checked.mode === 'live' ? recordProductionReadinessReport(checked) : checked;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.verdict === 'pass' ? 0 : (report.verdict === 'not_verified' ? 2 : 1);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ verdict: 'fail', error: error?.message || String(error) }));
    process.exitCode = 1;
  });
}
