import {
  ButtonItem,
  Field,
  PanelSection,
  PanelSectionRow,
  Spinner,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaWrench } from "react-icons/fa";

type ActionName = "volume_up" | "volume_down" | "mute";
type SetupAction = "verify" | "install" | "uninstall";
type SetupState = "configured" | "needs_setup" | "needs_repair" | "error";
type SetupComponent = "cec" | "bluetooth";

interface CecStatus {
  ready: boolean;
  active: boolean;
  audioLogicalAddress: number | null;
  targetLabel: string | null;
  objectPath: string | null;
  warning: string | null;
  error: string | null;
}

interface CecActionResult {
  ok: boolean;
  action: ActionName;
  audioLogicalAddress?: number;
  objectPath?: string;
  error?: string;
}

interface SetupDetails {
  stateFile: string | null;
  cecPhysicalAddress: string | null;
  cecDevice: string | null;
  cecObjectPath: string | null;
  bluetoothTarget: string | null;
  bluetoothHelper: string | null;
  keepListPath: string | null;
  persistentLayout: string | null;
}

interface SetupStatus {
  ok: boolean;
  action: SetupAction;
  component: SetupComponent;
  state: SetupState;
  summary: string;
  warnings: string[];
  failures: string[];
  details: SetupDetails;
  stdout: string;
  stderr: string;
  returncode: number;
}

const getStatus = callable<[], CecStatus>("get_status");
const volumeUp = callable<[], CecActionResult>("volume_up");
const volumeDown = callable<[], CecActionResult>("volume_down");
const mute = callable<[], CecActionResult>("mute");
const getCecSetupStatus = callable<[], SetupStatus>("get_cec_setup_status");
const installCecSetup = callable<[], SetupStatus>("install_cec_setup");
const uninstallCecSetup = callable<[], SetupStatus>("uninstall_cec_setup");
const getBluetoothSetupStatus = callable<[], SetupStatus>("get_bluetooth_setup_status");
const installBluetoothSetup = callable<[], SetupStatus>("install_bluetooth_setup");
const uninstallBluetoothSetup = callable<[], SetupStatus>("uninstall_bluetooth_setup");

const ACTIONS: Record<ActionName, () => Promise<CecActionResult>> = {
  volume_up: volumeUp,
  volume_down: volumeDown,
  mute,
};

const SETUP_STATUS_CALLS: Record<SetupComponent, () => Promise<SetupStatus>> = {
  cec: getCecSetupStatus,
  bluetooth: getBluetoothSetupStatus,
};

const SETUP_ACTIONS: Record<SetupComponent, Record<Exclude<SetupAction, "verify">, () => Promise<SetupStatus>>> = {
  cec: {
    install: installCecSetup,
    uninstall: uninstallCecSetup,
  },
  bluetooth: {
    install: installBluetoothSetup,
    uninstall: uninstallBluetoothSetup,
  },
};

const RPC_TIMEOUT_MS = 5000;
const SETUP_TIMEOUT_MS = 120000;

const withTimeout = async <T,>(promise: Promise<T>, message: string, timeoutMs = RPC_TIMEOUT_MS): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

const ACTION_LABELS: Record<ActionName, string> = {
  volume_up: "Volume Up",
  volume_down: "Volume Down",
  mute: "Mute",
};

const COMPONENT_LABELS: Record<SetupComponent, string> = {
  cec: "CEC Sleep / Wake",
  bluetooth: "Bluetooth Wake",
};

function setupStateLabel(state: SetupState): string {
  switch (state) {
    case "configured":
      return "Configured";
    case "needs_setup":
      return "Needs setup";
    case "needs_repair":
      return "Needs repair";
    default:
      return "Error";
  }
}

function setupPrimaryActionLabel(status: SetupStatus | null): string {
  if (!status) {
    return "Set Up";
  }
  return status.state === "configured" ? "Reinstall" : "Set Up";
}

function shouldDisplaySetupWarning(warning: string): boolean {
  return ![
    "Optional MediaTek rule not installed",
    "/usr/lib/holo/holo-sync-var not available; skipped SteamOS update dry-run",
  ].some((hiddenWarning) => warning.includes(hiddenWarning));
}

function createBackendFailureStatus(component: SetupComponent): SetupStatus {
  return {
    ok: false,
    action: "verify",
    component,
    state: "error",
    summary: "Unable to reach the setup backend.",
    warnings: [],
    failures: ["Backend request failed"],
    details: {
      stateFile: null,
      cecPhysicalAddress: null,
      cecDevice: null,
      cecObjectPath: null,
      bluetoothTarget: null,
      bluetoothHelper: null,
      keepListPath: null,
      persistentLayout: null,
    },
    stdout: "",
    stderr: "",
    returncode: 1,
  };
}

function SetupSection({
  title,
  status,
  loading,
  pending,
  onInstall,
  onRefresh,
  onUninstall,
}: {
  title: string;
  status: SetupStatus | null;
  loading: boolean;
  pending: SetupAction | null;
  onInstall: () => void;
  onRefresh: () => void;
  onUninstall: () => void;
}) {
  const statusLabel = loading
    ? `Checking ${title.toLowerCase()}...`
    : status
      ? setupStateLabel(status.state)
      : "Status unavailable";

  const visibleWarnings = status?.warnings.filter(shouldDisplaySetupWarning) ?? [];

  return (
    <PanelSection title={title}>
      <PanelSectionRow>
        <Field
          focusable
          highlightOnFocus
          label="Setup status"
          description={status?.summary ?? `Install or repair ${title.toLowerCase()}.`}
        >
          {loading ? <Spinner /> : statusLabel}
        </Field>
      </PanelSectionRow>

      {status?.details.persistentLayout && title === COMPONENT_LABELS.cec ? (
        <PanelSectionRow>
          <Field focusable highlightOnFocus label="Persistent layout">
            {status.details.persistentLayout}
          </Field>
        </PanelSectionRow>
      ) : null}

      {status?.details.cecDevice ? (
        <PanelSectionRow>
          <Field focusable highlightOnFocus label="CEC device">
            {status.details.cecDevice}
          </Field>
        </PanelSectionRow>
      ) : null}

      {status?.details.cecPhysicalAddress ? (
        <PanelSectionRow>
          <Field focusable highlightOnFocus label="CEC physical address">
            {status.details.cecPhysicalAddress}
          </Field>
        </PanelSectionRow>
      ) : null}

      {status?.details.bluetoothTarget ? (
        <PanelSectionRow>
          <Field focusable highlightOnFocus label="Bluetooth wake target">
            {status.details.bluetoothTarget}
          </Field>
        </PanelSectionRow>
      ) : null}

      {visibleWarnings.slice(0, 3).map((warning) => (
        <PanelSectionRow key={warning}>
          <Field focusable highlightOnFocus label="Warning" description={warning} />
        </PanelSectionRow>
      ))}

      {status?.failures.slice(0, 3).map((failure) => (
        <PanelSectionRow key={failure}>
          <Field focusable highlightOnFocus label="Issue" description={failure} />
        </PanelSectionRow>
      ))}

      <PanelSectionRow>
        <ButtonItem layout="below" disabled={pending !== null} onClick={onInstall}>
          {pending === "install" ? "Working..." : setupPrimaryActionLabel(status)}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={pending !== null} onClick={onRefresh}>
          Refresh Setup Status
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={pending !== null || status?.state === "needs_setup"}
          onClick={onUninstall}
        >
          {pending === "uninstall" ? "Working..." : "Uninstall Setup"}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

function Content() {
  const [status, setStatus] = useState<CecStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<Record<SetupComponent, SetupStatus | null>>({
    cec: null,
    bluetooth: null,
  });
  const [setupLoading, setSetupLoading] = useState<Record<SetupComponent, boolean>>({
    cec: true,
    bluetooth: true,
  });
  const [pending, setPending] = useState<Record<ActionName, boolean>>({
    volume_up: false,
    volume_down: false,
    mute: false,
  });
  const [setupPending, setSetupPending] = useState<Record<SetupComponent, SetupAction | null>>({
    cec: null,
    bluetooth: null,
  });

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const nextStatus = await withTimeout(getStatus(), "Timed out while checking CEC status");
      setStatus(nextStatus);
    } catch (error) {
      console.error("Failed to load cec-mote status", error);
      setStatus({
        ready: false,
        active: false,
        audioLogicalAddress: null,
        targetLabel: null,
        objectPath: null,
        warning: null,
        error: "Unable to reach the backend",
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const loadSetupStatus = async (component: SetupComponent) => {
    setSetupLoading((current) => ({ ...current, [component]: true }));
    try {
      const nextStatus = await withTimeout(
        SETUP_STATUS_CALLS[component](),
        `Timed out while checking ${component} setup`,
        SETUP_TIMEOUT_MS,
      );
      setSetupStatus((current) => ({ ...current, [component]: nextStatus }));
    } catch (error) {
      console.error(`Failed to load ${component} setup status`, error);
      setSetupStatus((current) => ({
        ...current,
        [component]: createBackendFailureStatus(component),
      }));
    } finally {
      setSetupLoading((current) => ({ ...current, [component]: false }));
    }
  };

  useEffect(() => {
    void loadStatus();
    void loadSetupStatus("cec");
    void loadSetupStatus("bluetooth");
  }, []);

  const handleAction = async (action: ActionName) => {
    setPending((current) => ({ ...current, [action]: true }));
    try {
      const result = await withTimeout(ACTIONS[action](), `Timed out while running ${action}`);
      if (!result.ok) {
        toaster.toast({
          title: "cec-mote",
          body: result.error ?? "CEC action failed",
        });
        await loadStatus();
      }
    } catch (error) {
      console.error(`Failed to execute ${action}`, error);
      toaster.toast({
        title: "cec-mote",
        body: "Unable to reach the backend",
      });
      await loadStatus();
    } finally {
      setPending((current) => ({ ...current, [action]: false }));
    }
  };

  const handleSetupAction = async (
    component: SetupComponent,
    action: Exclude<SetupAction, "verify">,
  ) => {
    setSetupPending((current) => ({ ...current, [component]: action }));
    try {
      const result = await withTimeout(
        SETUP_ACTIONS[component][action](),
        `Timed out while running ${action} for ${component}`,
        SETUP_TIMEOUT_MS,
      );
      setSetupStatus((current) => ({ ...current, [component]: result }));
      toaster.toast({
        title: "cec-mote",
        body: result.summary,
      });
    } catch (error) {
      console.error(`Failed to execute ${action} for ${component}`, error);
      toaster.toast({
        title: "cec-mote",
        body: "Unable to reach the setup backend",
      });
    } finally {
      setSetupPending((current) => ({ ...current, [component]: null }));
      await loadSetupStatus(component);
    }
  };

  const ready = status?.ready ?? false;

  return (
    <>
      <PanelSection>
        {!ready && !statusLoading ? (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => void loadStatus()}>
              Retry CEC Status
            </ButtonItem>
          </PanelSectionRow>
        ) : null}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={!ready || pending.volume_up}
            onClick={() => void handleAction("volume_up")}
          >
            {ACTION_LABELS.volume_up}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={!ready || pending.volume_down}
            onClick={() => void handleAction("volume_down")}
          >
            {ACTION_LABELS.volume_down}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={!ready || pending.mute}
            onClick={() => void handleAction("mute")}
          >
            {ACTION_LABELS.mute}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <SetupSection
        title={COMPONENT_LABELS.cec}
        status={setupStatus.cec}
        loading={setupLoading.cec}
        pending={setupPending.cec}
        onInstall={() => void handleSetupAction("cec", "install")}
        onRefresh={() => void loadSetupStatus("cec")}
        onUninstall={() => void handleSetupAction("cec", "uninstall")}
      />

      <SetupSection
        title={COMPONENT_LABELS.bluetooth}
        status={setupStatus.bluetooth}
        loading={setupLoading.bluetooth}
        pending={setupPending.bluetooth}
        onInstall={() => void handleSetupAction("bluetooth", "install")}
        onRefresh={() => void loadSetupStatus("bluetooth")}
        onUninstall={() => void handleSetupAction("bluetooth", "uninstall")}
      />
    </>
  );
}

export default definePlugin(() => {
  return {
    name: "cec-mote",
    titleView: <div className={staticClasses.Title}>cec-mote</div>,
    content: <Content />,
    icon: <FaWrench />,
  };
});
