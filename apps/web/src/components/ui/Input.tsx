"use client";

import { forwardRef, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

// One definition of "a field looks like this" — every form in the app used to
// repeat this class string by hand.
const field = cva(
  "w-full rounded-md border bg-paper text-ink outline-none transition placeholder:text-ink-2/70 focus:ring-4 focus:ring-accent-soft disabled:opacity-50 aria-[invalid=true]:border-danger",
  {
    variants: {
      size: {
        sm: "px-2.5 py-1.5 text-xs",
        md: "px-3 py-2 text-sm",
        lg: "px-3.5 py-2.5 text-sm",
      },
      invalid: {
        true: "border-danger",
        false: "border-rule focus:border-accent",
      },
      mono: { true: "font-mono", false: "" },
    },
    defaultVariants: { size: "md", invalid: false, mono: false },
  },
);

type FieldVariants = VariantProps<typeof field>;

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> &
  FieldVariants;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, invalid, mono, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid ? true : undefined}
      className={cn(field({ size, invalid, mono }), className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/**
 * Password field with a reveal toggle — typing a long password blind into an
 * admin form is where typos come from.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> &
  FieldVariants;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, invalid, mono, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid ? true : undefined}
      className={cn(field({ size, invalid, mono }), "resize-y", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
