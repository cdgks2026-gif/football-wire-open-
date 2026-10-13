/**
 * Initial snapshot at build time. Runtime checks continue every 24 hours.
 * Source is the public historic Transfermarkt-datasets CC0 snapshot (NOT live).
 * Failure leaves the source-controlled values intact, without fake prices.
 */
import {writeFileSync} from "node:fs";
import {readPinnedSnapshot,refreshMarketValues} from "./market-refresh.mjs";
try{
 const current=readPinnedSnapshot(process.cwd());
 const data=await refreshMarketValues(process.cwd(),current);
 if(data.values?.coverage<300)throw Error("Too few validated matches");
 writeFileSync("site/football-values.js",
  "/* Transfermarkt historical prices; player date may be older than snapshot date. */\n"+
  "window.FOOTBALL_TM_VALUES="+JSON.stringify(data.values)+";\n");
 console.log("[TM] validated",data.values.coverage,
  "matched players; historical valuation cutoff",data.values.datasetCutoff,
  "direct overrides",Object.keys(data.values.sourced||{}).length);
}catch(error){
 console.warn("[TM] keeping existing verified pinned valuations:",error.message);
}
