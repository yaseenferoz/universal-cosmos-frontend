import { Orbit, RefreshCw } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";

export function LoadingScreen() {
  const status = useExplorationStore((s) => s.status);
  const error = useExplorationStore((s) => s.error);
  if (status === "ready") return null;
  return (
    <div className="boot-screen" role={status === "error" ? "alert" : "status"}>
      <Orbit size={42} strokeWidth={1} />
      <p className="eyebrow">UNIVERSAL COSMOS</p>
      <h1>
        {status === "error" ? "A moment of turbulence." : "A new perspective."}
      </h1>
      <p>
        {status === "error" ? error : "Preparing your window to the universe"}
      </p>
      {status === "loading" ? (
        <div className="loading-track">
          <span />
        </div>
      ) : (
        <>
          <p className="error-help">
            A browser with WebGL 2 and hardware acceleration is required. If
            using the HTTP adapter, check the backend URL and connection.
          </p>
          <button
            className="travel-button"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </>
      )}
    </div>
  );
}
