import type { Metadata } from "next";
import { Callout } from "@/components/callout";
import { Code } from "@/components/code";

export const metadata: Metadata = { title: "Design in Figma" };

export default function Page() {
  return (
    <>
      <h1>Design in Figma</h1>
      <p className="text-lg text-muted">Your agent can create and edit designs in the file you have open.</p>

      <h2>Get started</h2>
      <p>Open the file in Figma Desktop, run the plugin and ask:</p>
      <Code code="design a login screen for a 390x844 phone in Figma" title="Prompt" copy={false} />
      <p>
        The agent builds the design with Figma plugin API scripts through <code>use_figma</code>, a few calls at a time
        (structure first, then sections), and checks each step with <code>get_screenshot</code>.
      </p>
      <Callout title="No Dev Mode needed">
        Everything works in the regular Design mode, so you don&apos;t need a Dev Mode seat.
      </Callout>

      <h2>How a script runs</h2>
      <p>
        <code>use_figma</code> takes the body of an async function with <code>figma</code> in scope. Whatever it returns
        comes back to the agent; nodes come back as <code>{"{ id, name, type, x, y, width, height }"}</code>, and{" "}
        <code>console.log</code> output is returned too.
      </p>
      <Code
        lang="js"
        title="use_figma · code"
        code={`const frame = figma.createFrame();
frame.name = "Login";
frame.resize(390, 844);
frame.layoutMode = "VERTICAL";
frame.itemSpacing = 20;

await figma.loadFontAsync({ family: "Inter", style: "Bold" });
const title = figma.createText();
title.fontName = { family: "Inter", style: "Bold" };
title.characters = "Welcome back";
frame.appendChild(title);

figma.viewport.scrollAndZoomIntoView([frame]);
return frame;`}
      />
      <ul>
        <li>
          <strong>One undo step.</strong> The whole run is a single undo step in Figma.
        </li>
        <li>
          <strong>Errors keep earlier changes.</strong> If a script throws, the changes it made before the error stay.
        </li>
        <li>
          <strong>Timeout.</strong> Scripts wait up to 60 seconds by default (<code>timeoutMs</code>, up to 10 minutes).
        </li>
      </ul>

      <h2>Rules of the plugin API</h2>
      <ul>
        <li>
          Files use dynamic page loading: use <code>figma.getNodeByIdAsync</code>, <code>figma.setCurrentPageAsync</code>{" "}
          and the <code>*Async</code> getters.
        </li>
        <li>
          Load every font before setting text: <code>{'await figma.loadFontAsync({ family: "Inter", style: "Regular" })'}</code>.
        </li>
        <li>
          Colours are 0–1 RGB, and paint arrays are immutable: assign a new array to <code>fills</code>.
        </li>
        <li>
          Set <code>layoutSizingHorizontal</code> and <code>layoutSizingVertical</code> only after the node is appended
          to an auto layout parent.
        </li>
        <li>
          Images from the web: <code>await figma.createImageAsync(url)</code>, then use its hash in an image fill.
        </li>
      </ul>

      <h2>Reuse what the file has</h2>
      <p>
        Ask the agent to use your local components, paint styles and variables. It can find them with{" "}
        <code>figma.getLocalPaintStylesAsync</code> and <code>figma.variables.getLocalVariablesAsync</code>, and bind
        variables to paints so the design stays on your system.
      </p>
    </>
  );
}
