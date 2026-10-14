import { CopyButton } from "./copy-command";
import { Reveal } from "./reveal";

const groups: { title: string; tone: string; prompts: string[] }[] = [
  {
    title: "Design to code",
    tone: "text-blue",
    prompts: [
      "implement the selected Figma frame",
      "implement this frame as a Flutter screen and match the spacing exactly",
      "build this frame as a React component with Tailwind, using our existing Button",
      "compare your screen with the Figma screenshot and fix the differences",
    ],
  },
  {
    title: "Design in Figma",
    tone: "text-coral",
    prompts: [
      "design a settings screen for a 390x844 phone in Figma",
      "add a dark mode version of the selected frame next to it",
      "turn this list into an auto layout component with three variants",
    ],
  },
  {
    title: "Components and tokens",
    tone: "text-sun",
    prompts: [
      "map the selected button to AppButton in lib/widgets/app_button.dart",
      "which components in this frame are not mapped yet?",
      "list the colour and spacing variables this frame uses and add them to our theme",
    ],
  },
];

export function Prompts() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map((g, gi) => (
        <Reveal key={g.title} delay={gi * 80} className="flex flex-col rounded-2xl border border-line bg-panel/60 p-5">
          <div className={`mb-4 font-mono text-xs tracking-wider uppercase ${g.tone}`}>{g.title}</div>
          <ul className="space-y-2">
            {g.prompts.map((p) => (
              <li
                key={p}
                className="group flex items-start gap-2 rounded-xl border border-line bg-black/25 py-2.5 pr-1.5 pl-3.5 transition-colors hover:border-line-2"
              >
                <span className="mt-[3px] font-mono text-xs text-sky select-none">&gt;</span>
                <span className="flex-1 pt-px font-mono text-[12.5px] leading-relaxed text-fg">{p}</span>
                <CopyButton text={p} event="copy_prompt" className="-my-0.5 opacity-60 group-hover:opacity-100" />
              </li>
            ))}
          </ul>
        </Reveal>
      ))}
    </div>
  );
}
