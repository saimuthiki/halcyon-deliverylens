import { causeShort } from '../lib/causes';

export default function CauseChip({ cause }: { cause: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-late/25 bg-late-tint px-2.5 py-0.5 text-sm text-ink">
      {causeShort(cause)}
    </span>
  );
}
