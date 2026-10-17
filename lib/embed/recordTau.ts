// The palette's "By meaning" threshold, kept outside the client component so the
// records eval (lib/embed/__eval__/records-eval.test.ts) can pin it without
// importing React.

/**
 * Minimum cosine for a loaded record to be shown by meaning. Measured, not picked by hand: the
 * lowest step of the records eval's sweep at which none of its 26 control queries (nothing
 * relevant loaded) shows a row, on 3,178 real records from the 16 record-vector cards. The
 * highest control top-1 there is 0.362 ("pharmacies", landing on a hospital). The eval's queries
 * were written by the same agent that chose this value, so it is an in-sample number and the
 * group stays behind ?semantic=1 until a blind query set passes.
 *
 * Run 3 (18 cards, 4,067 records, after bia-lar and wrc-communities joined): no step passes. At
 * 0.4, 6 of 37 controls show a row (0.429 to 0.506; "wind turbines" lands on BIA's "Wind River");
 * the first step with none, 0.55, has R@8 0.358 and empty 0.528, under the bars. Left at 0.4
 * pending that decision (the eval's DESIGN, "Run 3 (18 cards)").
 */
export const RECORD_TAU = 0.4;
