/**
 * Whether a press closes the Add repo dialog as a backdrop click. A click on
 * `::backdrop` lands on the `<dialog>` itself, but so does a drag that starts
 * in the path box and ends outside it; only a press that starts and ends on the
 * dialog element counts.
 */
export function backdropClose(downOnDialog: boolean, clickOnDialog: boolean): boolean {
  return downOnDialog && clickOnDialog
}
