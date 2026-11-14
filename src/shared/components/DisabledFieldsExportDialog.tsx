// DisabledFieldsExportDialog.tsx — the pre-export warning for disabled fields
// that still hold values (Phase 8a, SPEC §9bis).
//
// Shown ONLY when findOrphanedFields() returns something, which is rare. The
// point is that we never silently drop data the user cannot see in the app.

import type { OrphanedField } from '@/shared/utils/sheetExport'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DisabledFieldsExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: OrphanedField[]
  /** Export WITHOUT the listed fields — the default, least surprising choice. */
  onExportWithout: () => void
  /** Export WITH them. Their columns are emitted and the metadata sheet still
   *  marks them disabled, so a re-import restores values and disabled state. */
  onExportWith: () => void
}

export function DisabledFieldsExportDialog({
  open,
  onOpenChange,
  fields,
  onExportWithout,
  onExportWith,
}: DisabledFieldsExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Some hidden fields still have data</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {fields.length === 1 ? 'This field is' : 'These fields are'} switched off for this
            space, but {fields.length === 1 ? 'it still holds' : 'they still hold'} values on
            some transactions.
          </p>

          <ul className="flex flex-col divide-y rounded-lg border">
            {fields.map((field) => (
              <li key={field.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium">{field.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {field.count} transaction{field.count !== 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Including them adds a column per field. Re-importing the file restores both the
            values and their switched-off state.
          </p>
        </div>

        {/* Stacked on narrow screens so both labels stay readable at 375px. */}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onExportWith} className="w-full sm:w-auto">
            Include them anyway
          </Button>
          <Button onClick={onExportWithout} className="w-full sm:w-auto">
            Export without them
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
