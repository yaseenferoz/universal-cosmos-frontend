import { UniverseViewport } from "../features/exploration/UniverseViewport";
import { TopBar } from "../components/layout/TopBar";
import { ExplorationRail } from "../components/layout/ExplorationRail";
import { ObjectInformation } from "../components/information/ObjectInformation";
import { BottomControls } from "../components/controls/BottomControls";
import { ObjectDock } from "../components/controls/ObjectDock";
import { ViewportAnnotations } from "../components/layout/ViewportAnnotations";
import { LoadingScreen } from "../components/layout/LoadingScreen";
import { SearchDialog } from "../components/search/SearchDialog";
import { SettingsDialog } from "../components/panels/SettingsDialog";
import { HelpDialog } from "../components/panels/HelpDialog";
import { CollectionDialog } from "../components/panels/CollectionDialog";
import { useExplorationShortcuts } from "../hooks/useExplorationShortcuts";
import { LunarSurfaceControls } from "../components/controls/LunarSurfaceControls";
import { PlanetaryDescentControls } from "../components/controls/PlanetaryDescentControls";
import { SolarObservationControls } from "../components/controls/SolarObservationControls";
import { useLunarStore } from "../stores/lunarStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useRenderingStore } from "../stores/renderingStore";
import { ViewingActions } from "../components/controls/ViewingActions";
import { RenderingDiagnostics } from "../components/panels/RenderingDiagnostics";
import { planetaryEnvironments } from "../data/planetaryEnvironments";

export function App() {
  const dialog = useExplorationStore((s) => s.dialog);
  const viewMode = useExplorationStore((s) => s.viewMode);
  const selectedId = useExplorationStore((s) => s.selectedId);
  const lunarPhase = useLunarStore((s) => s.telemetry.phase);
  const lunarActive = !["orbit", "error"].includes(lunarPhase);
  const diagnostics = useRenderingStore((s) => s.diagnosticsEnabled);
  const hasExplorationControls = viewMode === "exploration" && selectedId !== null &&
    (selectedId === "moon" || planetaryEnvironments[selectedId] !== undefined);
  useExplorationShortcuts();
  return (
    <main
      className={`universe-app view-${viewMode} ${lunarActive ? "is-lunar-active" : ""} ${hasExplorationControls ? "has-exploration-controls" : ""} ${selectedId === "sun" && viewMode === "exploration" ? "is-solar-observation" : ""} ${diagnostics ? "has-diagnostics" : ""}`}
    >
      <UniverseViewport />
      <div className="viewport-vignette" />
      <TopBar />
      <ExplorationRail />
      <ViewportAnnotations />
      <ObjectInformation />
      <LunarSurfaceControls />
      <PlanetaryDescentControls key={selectedId} />
      <SolarObservationControls />
      <ViewingActions />
      <RenderingDiagnostics />
      {viewMode === "overview" && <ObjectDock />}
      <BottomControls />
      <LoadingScreen />
      {dialog === "search" && <SearchDialog />}
      {dialog === "settings" && <SettingsDialog />}
      {dialog === "help" && <HelpDialog />}
      {dialog === "collection" && <CollectionDialog />}
    </main>
  );
}
