import type { Metadata } from "next";
import { Code } from "@/components/code";
import { OsCode, OsPath } from "@/components/os";

export const metadata: Metadata = { title: "Offline snapshots" };

export default function Page() {
  return (
    <>
      <h1>Offline snapshots</h1>
      <p className="text-lg text-muted">Keep reading designs with the plugin closed.</p>
      <p>
        When the plugin isn&apos;t connected, every read tool falls back to the newest saved snapshot that holds the
        node. Snapshots live in{" "}
        <OsPath mac="~/.figma-local-mcp/snapshots" win="%USERPROFILE%\.figma-local-mcp\snapshots" />.
      </p>

      <h2>Automatic cache</h2>
      <p>
        Each full read from the plugin is cached as a snapshot. If you close Figma, the agent can still read the frames
        it has already seen. A cached read never replaces a snapshot you saved yourself.
      </p>

      <h2>Save a full export</h2>
      <p>
        <code>save_design_export</code> writes a complete export of a node (the selection by default) to a JSON file: the
        node tree with every layout, paint, text, variable, style, component and interaction detail, icon SVGs and
        renders of masked layers.
      </p>
      <Code code="save a design export of the selected frame" title="Prompt" copy={false} />

      <h2>Import an export</h2>
      <p>
        Load an export JSON as a snapshot with <code>import_design_export</code>, or from the command line:
      </p>
      <OsCode
        lang="bash"
        mac={{ code: "npx -y @irshad.io/figma-local-mcp@latest import ./onboarding.json", title: "Terminal" }}
        win={{ code: "npx -y @irshad.io/figma-local-mcp@latest import .\\onboarding.json", title: "PowerShell" }}
      />
      <p>This is handy for sharing a frame with a teammate who doesn&apos;t have the file open.</p>

      <h2>Limits</h2>
      <p>
        Without the plugin, variable and style names are unknown, so <code>get_variable_defs</code> returns the raw values
        used in the snapshot. Writing with <code>use_figma</code> always needs the plugin.
      </p>
      <p>
        Run <code>whoami</code> to list the saved snapshots.
      </p>
    </>
  );
}
