/**
 * Black-swan event configs for the multi-event survivor backtest.
 * Archive block numbers from Dune query 7739626 (+ the original June set);
 * ISO timestamps are the block times, used to drop HF samples taken after a
 * position was already liquidated.
 */
export const EVENTS = {
  june: {
    label: "June-2022 ETH crash (stETH cascade)",
    blocks: [
      { label: "d0", block: 14935700, iso: "2022-06-08T12:00:00Z" },
      { label: "d1", block: 14967150, iso: "2022-06-13T12:00:00Z" },
      { label: "d2", block: 14974300, iso: "2022-06-14T03:00:00Z" },
      { label: "d3", block: 14994600, iso: "2022-06-18T20:00:00Z" },
    ],
  },
  ust: {
    label: "UST/LUNA collapse (May 2022)",
    // Dense 6h sampling (Dune 7740207) — the daily blocks missed the intraday
    // May-11/12 crash, so recall was sampling-bound; this resolves it.
    blocks: [
      { label: "h00", block: 14739155, iso: "2022-05-09T00:00:00Z" },
      { label: "h06", block: 14740738, iso: "2022-05-09T06:00:00Z" },
      { label: "h12", block: 14742300, iso: "2022-05-09T12:00:00Z" },
      { label: "h18", block: 14743796, iso: "2022-05-09T18:00:00Z" },
      { label: "h24", block: 14745350, iso: "2022-05-10T00:00:00Z" },
      { label: "h30", block: 14746933, iso: "2022-05-10T06:00:00Z" },
      { label: "h36", block: 14748436, iso: "2022-05-10T12:00:00Z" },
      { label: "h42", block: 14749985, iso: "2022-05-10T18:00:00Z" },
      { label: "h48", block: 14751558, iso: "2022-05-11T00:00:00Z" },
      { label: "h54", block: 14753134, iso: "2022-05-11T06:00:00Z" },
      { label: "h60", block: 14754717, iso: "2022-05-11T12:00:00Z" },
      { label: "h66", block: 14756318, iso: "2022-05-11T18:00:00Z" },
      { label: "h72", block: 14757896, iso: "2022-05-12T00:00:00Z" },
      { label: "h78", block: 14759408, iso: "2022-05-12T06:00:00Z" },
      { label: "h84", block: 14760960, iso: "2022-05-12T12:00:00Z" },
      { label: "h90", block: 14762533, iso: "2022-05-12T18:00:00Z" },
      { label: "h96", block: 14764084, iso: "2022-05-13T00:00:00Z" },
      { label: "h102", block: 14765642, iso: "2022-05-13T06:00:00Z" },
      { label: "h108", block: 14767234, iso: "2022-05-13T12:00:00Z" },
      { label: "h114", block: 14768842, iso: "2022-05-13T18:00:00Z" },
    ],
  },
  ftx: {
    label: "FTX collapse (Nov 2022)",
    blocks: [
      { label: "d0", block: 15925172, iso: "2022-11-08T12:00:00Z" },
      { label: "d1", block: 15932331, iso: "2022-11-09T12:00:00Z" },
      { label: "d2", block: 15939479, iso: "2022-11-10T12:00:00Z" },
      { label: "d3", block: 15946636, iso: "2022-11-11T12:00:00Z" },
    ],
  },
  usdc: {
    label: "USDC depeg / SVB (Mar 2023)",
    // Dense 6h sampling (Dune 7740575). USDC-collateral positions; the peg break
    // (USDC→$0.94) drops their HF while USDT/DAI debt holds $1.
    blocks: [
      { label: "h00", block: 16786949, iso: "2023-03-09T00:00:00Z" },
      { label: "h06", block: 16788726, iso: "2023-03-09T06:00:00Z" },
      { label: "h12", block: 16790511, iso: "2023-03-09T12:00:00Z" },
      { label: "h18", block: 16792290, iso: "2023-03-09T18:00:00Z" },
      { label: "h24", block: 16794062, iso: "2023-03-10T00:00:00Z" },
      { label: "h30", block: 16795831, iso: "2023-03-10T06:00:00Z" },
      { label: "h36", block: 16797589, iso: "2023-03-10T12:00:00Z" },
      { label: "h42", block: 16799367, iso: "2023-03-10T18:00:00Z" },
      { label: "h48", block: 16801144, iso: "2023-03-11T00:00:00Z" },
      { label: "h54", block: 16802922, iso: "2023-03-11T06:00:00Z" },
      { label: "h60", block: 16804702, iso: "2023-03-11T12:00:00Z" },
      { label: "h66", block: 16806478, iso: "2023-03-11T18:00:00Z" },
      { label: "h72", block: 16808258, iso: "2023-03-12T00:00:00Z" },
      { label: "h78", block: 16810026, iso: "2023-03-12T06:00:00Z" },
      { label: "h84", block: 16811807, iso: "2023-03-12T12:00:00Z" },
      { label: "h90", block: 16813589, iso: "2023-03-12T18:00:00Z" },
      { label: "h96", block: 16815367, iso: "2023-03-13T00:00:00Z" },
      { label: "h102", block: 16817146, iso: "2023-03-13T06:00:00Z" },
      { label: "h108", block: 16818932, iso: "2023-03-13T12:00:00Z" },
      { label: "h114", block: 16820708, iso: "2023-03-13T18:00:00Z" },
    ],
  },
};

export const AAVE_V2_POOL = "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9";
