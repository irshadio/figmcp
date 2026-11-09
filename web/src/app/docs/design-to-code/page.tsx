import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Callout } from "@/components/callout";
import { Code } from "@/components/code";

export const metadata: Metadata = pageMeta({
  title: "Design to code",
  path: "/docs/design-to-code",
  description:
    "Turn Figma frames into Flutter widgets, SwiftUI views, React + Tailwind components or HTML + Tailwind pages with your coding agent, with assets saved to your project and a screenshot to compare against.",
});

export default function Page() {
  return (
    <>
      <h1>Design to code</h1>
      <p className="text-lg text-muted">Turn a frame into Flutter, SwiftUI, React + Tailwind or HTML + Tailwind code.</p>

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

      <h2 id="framework">Flutter, SwiftUI, React or HTML</h2>
      <p>The framework is chosen in this order:</p>
      <ol>
        <li>
          The <code>framework</code> argument, when the agent passes one (<code>flutter</code>, <code>swiftui</code>,{" "}
          <code>react</code> or <code>html</code>).
        </li>
        <li>The client&apos;s languages and frameworks (for example <code>dart</code>, <code>swift</code> or <code>html</code>).</li>
        <li>The <code>FIGMA_LOCAL_MCP_FRAMEWORK</code> environment variable.</li>
        <li>
          The working directory: a <code>pubspec.yaml</code> means Flutter, a <code>Package.swift</code>,{" "}
          <code>.xcodeproj</code> or <code>.xcworkspace</code> means SwiftUI, and an <code>index.html</code> without a{" "}
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

      <h2 id="swiftui">SwiftUI</h2>
      <p>
        Start your agent in a Swift package or an Xcode project (the folder with <code>Package.swift</code>, an{" "}
        <code>.xcodeproj</code> or an <code>.xcworkspace</code>) and SwiftUI is picked automatically. The view is written
        the way a production screen is built, not as a stack of fixed boxes.
      </p>
      <ul>
        <li>
          <strong>Real controls.</strong> Buttons with a press style, selection with a sliding indicator and haptics,
          Toggles, ProgressViews, calendars, snapping carousels, <code>LazyVGrid</code> grids, and pinned bars in{" "}
          <code>safeAreaInset</code>.
        </li>
        <li>
          <strong>Exact values.</strong> Sizes are in points, fonts are named by PostScript face and scale with Dynamic
          Type, and text keeps Figma&apos;s line boxes. Rows and grids stack at accessibility sizes.
        </li>
        <li>
          <strong>Design tokens.</strong> The design&apos;s variables become <code>DesignTokens</code> in a shared{" "}
          <code>DesignSystem.swift</code>, with <code>Color(hex:)</code> and the button style. Merge it into the target
          once; later screens add only what it lacks.
        </li>
        <li>
          <strong>Ready to wire up.</strong> Selection is <code>@State</code> set to the design, and the screen asks its
          owner to act through a nested <code>Action</code> enum, so moving state to a view model and adding navigation is
          straightforward.
        </li>
        <li>
          <strong>A Structure block.</strong> The response names what each part is, how sure the detection is and why,
          and the SwiftUI pattern the code uses. A layer name tag such as <code>Pay [button]</code> or{" "}
          <code>[no-role]</code> sets or clears a role.
        </li>
      </ul>
      <h3 id="swiftui-assets">Assets</h3>
      <p>
        Images go into the project&apos;s asset catalog as image sets: the app&apos;s own <code>*.xcassets</code>, else{" "}
        <code>Assets.xcassets</code>. The agent can name another catalog with <code>assetsDir</code>. In a Swift package,
        put the catalog under the target&apos;s resources and load images with{" "}
        <code>Image(&quot;name&quot;, bundle: .module)</code>.
      </p>
      <Code code="implement the selected Figma frame as a SwiftUI view" title="Prompt" copy={false} />

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
      <p>
        Flutter code is analyzed and rendered with <code>flutter test</code>. SwiftUI code is compiled and rendered in
        the iOS simulator (Xcode needed), and the check can tap every button and render at other Dynamic Type sizes.
      </p>
      <Code code="check my component against the Figma frame with verify_code" title="Prompt" copy={false} />
      <h3 id="coverage">What the check does not cover</h3>
      <p>
        A pixel match says the default state looks right. It does not say the button&apos;s pressed or disabled state,
        its keyboard behaviour or its screen-reader name are right. So every <code>verify_code</code> result has a{" "}
        <code>coverage</code> block:
      </p>
      <ul>
        <li>
          <strong>Checked:</strong> what the run did, such as the default state at the design size, the layer boxes, the
          buttons it tapped or the keys it pressed.
        </li>
        <li>
          <strong>Not checked, per control:</strong> each button, field, toggle or tab row with the states, keyboard and
          screen-reader behaviour no check covered. A state the design draws (a <code>State=Disabled</code> variant) is
          told apart from one it never drew, so the designer knows what to add.
        </li>
        <li>
          <strong>Screen:</strong> dark mode, other widths and text sizes, right-to-left and reduced motion.
        </li>
      </ul>
      <p>
        React and HTML checks also press Tab through the page and report the Tab order, controls with no visible focus
        indicator, buttons Enter or Space does not activate, controls without an accessible name and clickable elements
        the keyboard cannot reach. A control the design has but the code draws as a plain element is called out, since
        keyboard and screen-reader users cannot use it. The agent hands the not-checked list back with its implementation, so the next
        reviewer knows what is left.
      </p>
      <Code
        lang="json"
        title="verify_code (part of the result)"
        copy={false}
        code={`"coverage": {
  "checked": ["default state at 393x852, light mode: 0.8% of pixels differ", "keyboard: 4 elements reached with Tab, ..."],
  "notChecked": [{
    "element": "Pay now (button, 1:2)",
    "checked": ["reached with Tab (stop 4)", "Enter/Space activates it", "accessible name \"Pay now\""],
    "notChecked": ["disabled state (in the design as State=Disabled; not rendered)", "loading state (not in the design)", "no visible focus indicator"]
  }],
  "screen": ["dark mode", "widths other than 393", "browser zoom and larger text", "right-to-left languages"]
}`}
      />

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
