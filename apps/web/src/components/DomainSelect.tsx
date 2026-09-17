"use client";

import { Select } from "./ui/Select";

interface Props {
  value: string;
  domains: string[];
  onChange: (domain: string) => void;
}

/** Domain picker in the address toolbar. */
export function DomainSelect({ value, domains, onChange }: Props) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      items={domains}
      ariaLabel="Choose domain"
      triggerClassName="font-mono text-base sm:text-lg"
    />
  );
}
