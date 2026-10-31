/**
 * Whether a press closes the Add repo dialog as a backdrop click. A click lands
 * on the nearest common ancestor of where the press went down and came up, so
 * it hits the `<dialog>` whenever either end is on `::backdrop`: a drag out of
 * the path box, or a press from the dimmed page into the panel. Only a press
 * that goes down, clicks, and comes up on the dialog element itself counts.
 */
export function backdropClose(downOnDialog: boolean, clickOnDialog: boolean, upOnDialog: boolean): boolean {
  return downOnDialog && clickOnDialog && upOnDialog
}
