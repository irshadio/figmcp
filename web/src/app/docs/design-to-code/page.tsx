import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Callout } from "@/components/callout";
import { Code } from "@/components/code";

export const metadata: Metadata = pageMeta({
  title: "Design to code",
  path: "/docs/design-to-code",
  description:
    "Turn Figma frames into Flutter widgets, React + Tailwind components or HTML + Tailwind pages with your coding agent, with assets saved to your project and a screenshot to compare against.",
});

export default function Page() {
  return (
    <>
      <h1>Design to code</h1>
      <p className="text-lg text-muted">Turn a frame into Flutter, React + Tailwind or HTML + Tailwind code.</p>

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

      <h2 id="framework">Flutter, React or HTML</h2>
      <p>The framework is chosen in this order:</p>
      <ol>
        <li>
          The <code>framework</code> argument, when the agent passes one (<code>flutter</code>, <code>react</code> or{" "}
          <code>html</code>).
        </li>
        <li>The client&apos;s languages and frameworks (for example <code>dart</code> or <code>html</code>).</li>
        <li>The <code>FIGMA_LOCAL_MCP_FRAMEWORK</code> environment variable.</li>
        <li>
          The working directory: a <code>pubspec.yaml</code> means Flutter, and an <code>index.html</code> without a{" "}
          <code>package.json</code> means a static HTML site. Anything else gets React + Tailwind.
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
        Every other project gets a React component with Tailwind classes: Next.js, Vite, Remix or plain React. Auto
        layout frames become flex boxes, grids become CSS grids, and everything else is placed by its constraints. The
        classes work in Tailwind 3.4 and 4.
      </p>
      <ul>
        <li>
          <strong>Exact values.</strong> Sizes, spacing, radii, colours, fonts and line heights match the design. Theme
          classes like <code>px-4</code> or <code>rounded-full</code> are used only where they equal the design value;
          everything else uses arbitrary values like <code>text-[#0a1f44]</code>.
        </li>
        <li>
          <strong>Real fonts.</strong> Classes name the font family itself, and the response lists the families and
          weights to load.
        </li>
        <li>
          <strong>Design tokens.</strong> Variables appear as <code>var(--name,value)</code>, and the response includes
          the CSS that declares them, with a Tailwind 4 <code>@theme</code> that turns them into utilities.
        </li>
        <li>
          <strong>Readable code.</strong> Repeated items (cards, list rows, tabs) become a data array with{" "}
          <code>.map()</code>, and Figma text styles used more than once are named in a <code>textStyles</code>{" "}
          object.
        </li>
        <li>
          <strong>Semantic markup.</strong> Prototype taps and layer names give buttons, links, navigation, headers and
          footers; heading text styles give <code>h1</code>–<code>h6</code>; placeholders give text inputs; content
          images get alt text.
        </li>
        <li>
          <strong>Screens and pages.</strong> Phone frames fill the screen and scroll; rows wider than the screen scroll
          sideways. Frames 768 wide or more are web pages: full-width sections stretch across the screen and the rest
          stays in a centred column. The agent can turn these off with <code>screen</code> and <code>page</code>.
        </li>
        <li>
          <strong>Assets in your project.</strong> SVGs and images are named after their layers, with the commands to
          copy them into <code>public/figma</code> (<code>static/figma</code> for SvelteKit).
        </li>
      </ul>
      <Code code="implement the selected Figma frame as a React component with Tailwind" title="Prompt" copy={false} />

      <h2 id="html">HTML + Tailwind</h2>
      <p>
        Static sites get the same markup as plain HTML with Tailwind classes, ready to paste into a page that builds its
        CSS with the Tailwind CLI. Assets go to <code>assets/figma</code> beside the page.
      </p>
      <Code code="implement the selected Figma frame as an HTML page with Tailwind" title="Prompt" copy={false} />

      <h2 id="verify">Check the result</h2>
      <p>
        <code>verify_code</code> renders the code in headless Chrome and compares it with Figma&apos;s own render of the
        frame: layout mismatches, differing pixels and a diff image. It checks the generated code, a component or page
        from your project with its stylesheet, or a layout on a phone-sized screen. It needs Chrome, and loads React and
        Tailwind from a CDN.
      </p>
      <Code code="check my component against the Figma frame with verify_code" title="Prompt" copy={false} />

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
