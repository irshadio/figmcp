import { CheckIcon } from "./icons";
import { Reveal } from "./reveal";

const rows: [string, string, string, boolean?][] = [
  ["Where reads come from", "A plugin in Figma Desktop, over localhost", "Figma's servers"],
  ["Read limits", "None", "Daily and per-minute limits on Dev and Full seats; about 20 calls a month on Starter, View or Collab", true],
  ["Plan needed", "Any plan, including free", "A paid Dev or Full seat for regular use", true],
  ["Flutter", "Native Flutter widgets, assets saved to your pubspec folders", "React + Tailwind reference by default", true],
  ["React + Tailwind", "Yes", "Yes"],
  ["Design in Figma", "Yes, with use_figma", "Yes"],
  ["Reads with Figma closed", "Yes, from saved snapshots", "No", true],
  ["Code Connect", "Local mappings file, any plan", "Figma Code Connect"],
];

export function Compare() {
  return (
    <Reveal className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-line">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-white/[0.02]">
              <th className="w-[26%] px-5 py-4 font-medium text-dim" />
              <th className="w-[37%] border-x border-sky/20 bg-sky/[0.06] px-5 py-4 font-medium text-fg">Figma Local MCP</th>
              <th className="w-[37%] px-5 py-4 font-medium text-muted">Figma&apos;s MCP server</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ours, theirs, win]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <td className="px-5 py-4 text-muted">{label}</td>
                <td className="border-x border-sky/20 bg-sky/[0.04] px-5 py-4 text-fg">
                  <span className="flex gap-2.5">
                    {win && <CheckIcon width={16} height={16} className="mt-0.5 shrink-0 text-ok" />}
                    <span>{ours}</span>
                  </span>
                </td>
                <td className="px-5 py-4 text-muted">{theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-white/[0.015] px-5 py-3 text-xs text-dim">
        Based on Figma&apos;s published{" "}
        <a
          href="https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-line-2 underline-offset-2 hover:text-muted"
        >
          rate limits and access
        </a>{" "}
        docs, October 2026. Not affiliated with Figma, Inc.
      </p>
    </Reveal>
  );
}
