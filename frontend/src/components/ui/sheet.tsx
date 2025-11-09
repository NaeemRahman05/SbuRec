import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { X } from "lucide-react";

interface SheetProps extends Dialog.DialogProps {
  title: string;
  description?: string;
}

export const Sheet: React.FC<SheetProps> = ({ children, title, description, ...props }) => (
  <Dialog.Root {...props}>
    {children}
  </Dialog.Root>
);

export const SheetTrigger = Dialog.Trigger;

export const SheetContent: React.FC<
  Dialog.DialogContentProps & { title: string; description?: string }
> = ({ className, title, description, children, ...props }) => (
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
    <Dialog.Content
      className={clsx(
        "fixed inset-y-0 right-0 z-50 w-full max-w-md translate-x-full bg-background/95 px-6 py-8 shadow-xl transition-transform duration-300 data-[state=open]:translate-x-0",
        className,
      )}
      {...props}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Dialog.Title className="text-lg font-semibold text-foreground">
            {title}
          </Dialog.Title>
          {description ? (
            <Dialog.Description className="text-sm text-foreground/60">
              {description}
            </Dialog.Description>
          ) : null}
        </div>
        <Dialog.Close className="rounded-full border border-border p-2 text-foreground/70 transition hover:border-accent hover:text-accent">
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>
      <div className="h-full overflow-y-auto pr-2 text-sm text-foreground/80">{children}</div>
    </Dialog.Content>
  </Dialog.Portal>
);

