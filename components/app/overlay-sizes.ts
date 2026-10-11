// Dialogs and menus come from components/ui, whose own sizes suit a computer. The places that use them add these classes.

// On a phone every control is at least a 40px target, so the close mark in a dialog's corner grows. It changes nothing
// from the sm breakpoint up.
export const DIALOG_CLOSE_PHONE = "max-sm:[&_[data-slot=dialog-close]]:size-10"

// A row in a dropdown menu, 40px tall on a phone.
export const MENU_ITEM_PHONE = "max-sm:min-h-10 max-sm:py-2"

// A dialog lays out as a grid, and a grid column will not shrink below its widest unbroken line. A long name or web address
// would then stretch the whole dialog past the screen, so what the dialog holds is allowed to be as narrow as the dialog.
export const DIALOG_FIT = "[&>*]:min-w-0"
