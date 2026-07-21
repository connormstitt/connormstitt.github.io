/* =====================================================
   STITT FERMENTS — BATCH ARCHIVE
   =====================================================
   HOW TO ADD A BATCH:
   1. Copy an entry below (everything from { to },)
   2. Edit the fields
   3. Set  visible: true  when you want it public

   ONLY entries with  visible: true  appear on the site.
   If the flag is false or missing, the batch stays
   hidden — so test runs are private by default.

   The page renders entries in the order listed here
   (put newest first).
===================================================== */

const FERMENT_BATCHES = [
  {
    batch: "001-A",
    name: "Traditional Napa Kimchi",
    started: "YYYY.MM.DD",
    packaged: "YYYY.MM.DD",
    status: "Naturally Fermented",
    storage: "Keep Refrigerated",
    location: "PA\u2013SC",
    notes: "The one that started it all. 아마도 맛있습니다!",
    qcApproved: true,
    visible: true,
  },
  {
    batch: "001-B",
    name: "Napa Kimchi \u2014 extra 고춧가루",
    started: "YYYY.MM.DD",
    packaged: "YYYY.MM.DD",
    status: "Fermenting",
    storage: "Counter, then fridge",
    location: "PA\u2013SC",
    notes: "Same base, more heat. We'll see.",
    qcApproved: false,
    visible: true,
  },
  {
    batch: "002-A",
    name: "Test run \u2014 radish only",
    started: "YYYY.MM.DD",
    packaged: "\u2014",
    status: "Test batch",
    storage: "\u2014",
    location: "PA\u2013SC",
    notes: "Example of a hidden entry: no visible flag, so it never renders.",
    // no "visible" field -> hidden by default
  },
];
