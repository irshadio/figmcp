import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Code } from "@/components/code";
import { OsPath } from "@/components/os";

export const metadata: Metadata = pageMeta({
  title: "Code Connect",
  path: "/docs/code-connect",
  description:
    "Map Figma components to your Flutter or React components so generated code reuses them. Mappings live in your project, on any Figma plan.",
});

export default function Page() {
  return (
    <>
      <h1>Code Connect</h1>
      <p className="text-lg text-muted">Map design components to the components in your codebase.</p>
      <p>
        Once a component is mapped, <code>get_design_context</code> names your code component for every instance of it,
        instead of drawing it from its layers. Your agent reuses <code>AppPrimaryButton</code> rather than rebuilding a
        button.
      </p>

      <h2>Map a component</h2>
      <p>Select an instance in Figma and ask:</p>
      <Code code="map the selected button to AppPrimaryButton in lib/widgets/app_button.dart" title="Prompt" copy={false} />
      <p>
        The agent calls <code>add_code_connect_map</code> with the instance, component or component set id. A component
        inside a set maps the whole set.
      </p>
      <table>
        <thead>
          <tr>
            <th>Argument</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>componentName</code></td>
            <td>Code component name, for example <code>AppPrimaryButton</code>.</td>
          </tr>
          <tr>
            <td><code>source</code></td>
            <td>Path of the code component in the project.</td>
          </tr>
          <tr>
            <td><code>label</code></td>
            <td>Optional framework, for example Flutter or React.</td>
          </tr>
        </tbody>
      </table>

      <h2>See what&apos;s mapped</h2>
      <p>
        <code>get_code_connect_map</code> lists the instances in a node and their code components, plus the components
        that aren&apos;t mapped yet. It&apos;s a quick way to find what&apos;s left to map.
      </p>
      <Code code="which components in this frame are not mapped yet?" title="Prompt" copy={false} />

      <h2>Where mappings live</h2>
      <p>
        Mappings are saved in your project at{" "}
        <OsPath mac=".figma-local/code-connect.json" win=".figma-local\code-connect.json" />, under the working
        directory.
        The folder gets its own <code>.gitignore</code> by default. Set <code>FIGMA_LOCAL_MCP_CODE_CONNECT</code> to use
        a different file, for example one you commit and share with your team.
      </p>
      <p>
        To ignore the mappings for one read, the agent can pass <code>disableCodeConnect</code> to{" "}
        <code>get_design_context</code>. To remove one, use <code>remove_code_connect_map</code>.
      </p>
    </>
  );
}
