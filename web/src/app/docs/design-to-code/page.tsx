import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Callout } from "@/components/callout";
import { Code } from "@/components/code";

export const metadata: Metadata = pageMeta({
  title: "Design to code",
  path: "/docs/design-to-code",
  description:
    "Turn Figma frames into Flutter widgets or React + Tailwind components with your coding agent, with assets saved to your project and a screenshot to compare against.",
});

export default function Page() {
  return (
    <>
      <h1>Design to code</h1>
      <p className="text-lg text-muted">Turn a frame into Flutter or React + Tailwind code.</p>

      <h2>Pick a frame</h2>
      <p>Select a frame in Figma and ask your agent:</p>
      <Code code="implement the selected Figma frame" title="Prompt" copy={false} />
      <p>
        Or paste a Figma link that has a <code>node-id</code>. The id in the link (<code>node-id=1-2</code>) is the
        node <code>1:2</code>. With no id, the tools use the current selection.
      </p>
      <Code code="implement https://www.figma.com/design/AbC123/App?node-id=42-1337" title="Prompt" copy={false} />

      <h2>What the agent gets</h2>
      <p>
        <code>get_design_context</code> is the main tool. For a node it returns:
      </p>
      <ul>
        <li>Reference code for your stack</li>
        <li>The assets the code uses (SVGs and images), saved to disk</li>
        <li>A screenshot of the node to compare against</li>
        <li>The variables the node uses</li>
      </ul>
      <Callout>
        The code is a reference, not the final answer. Your agent adapts it to your project: your theme, your widgets
        and your conventions.
      </Callout>

      <h2 id="framework">Flutter or React</h2>
      <p>The framework is chosen in this order:</p>
      <ol>
        <li>The <code>framework</code> argument, when the agent passes one.</li>
        <li>The client&apos;s languages and frameworks (for example <code>dart</code> or <code>flutter</code>).</li>
        <li>
          The <code>FIGMA_LOCAL_MCP_FRAMEWORK</code> environment variable (<code>flutter</code> or <code>react</code>).
        </li>
        <li>
          A <code>pubspec.yaml</code> in the working directory means Flutter. Anything else gets React + Tailwind.
        </li>
      </ol>

      <h2 id="flutter">Flutter</h2>
      <p>
        Start your agent in the Flutter project (the folder with <code>pubspec.yaml</code>) and Flutter is picked
        automatically. The code uses standard widgets, and SVGs are drawn with <code>SvgPicture.asset</code>, so add{" "}
        <code>flutter_svg</code> if the project doesn&apos;t have it:
      </p>
      <Code code="flutter pub add flutter_svg" lang="bash" title="Terminal" />
      <p>
        Portrait frames of a phone&apos;s width (300–480) are drawn as a screen that fills the device and scrolls when
        it&apos;s tall. The agent can turn this on or off with <code>screen</code>.
      </p>
      <h3 id="flutter-assets">Assets</h3>
      <p>
        SVGs and images go into the folders your <code>pubspec.yaml</code> declares under <code>flutter: assets:</code>.
        Folders named like <code>assets/svg</code> or <code>assets/icons</code> get the SVGs, and{" "}
        <code>assets/images</code> or <code>assets/png</code> get the images. Without them, both go to{" "}
        <code>assets/figma</code>. The agent can override this with <code>assetsDir</code>.
      </p>
      <Code
        lang="text"
        title="pubspec.yaml"
        copy={false}
        code={`flutter:
  assets:
    - assets/svg/
    - assets/images/`}
      />
      <Code code="implement the selected Figma frame as a Flutter screen" title="Prompt" copy={false} />

      <h2 id="react">React + Tailwind</h2>
      <p>
        Every project without a <code>pubspec.yaml</code> gets React with Tailwind classes: Next.js, Vite, Remix or plain
        React. Auto layout frames become flex boxes, grids become CSS grids, and everything else is placed by its
        constraints. Colours and sizes that don&apos;t match the Tailwind scale use arbitrary values like{" "}
        <code>text-[#0a1f44]</code>.
      </p>
      <p>
        Using Vue, Svelte or plain HTML? The React output still works as a reference: ask the agent to convert it to
        your stack.
      </p>
      <Code code="implement the selected Figma frame as a React component with Tailwind" title="Prompt" copy={false} />

      <h2>Large frames</h2>
      <p>
        Very large nodes return metadata (the layer outline) instead of code, so the agent can read the sections one by
        one. Ask for a child frame, or have the agent pass <code>forceCode</code> to get code for the whole node.
      </p>

      <h2>Tips</h2>
      <ul>
        <li>Use auto layout in Figma where you can. It maps directly to rows, columns and flex.</li>
        <li>Name your layers. Names show up in the code and help the agent pick widget names.</li>
        <li>
          Map shared components with <Link href="/docs/code-connect">Code Connect</Link> so instances become your own
          components.
        </li>
        <li>Ask the agent to compare its result with <code>get_screenshot</code> when the details matter.</li>
      </ul>
    </>
  );
}
