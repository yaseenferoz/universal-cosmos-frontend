import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { celestialService } from "../../services/api";
import type { CelestialObject } from "../../types/celestial";
import { useExplorationStore } from "../../stores/explorationStore";
import { PlanetSwatch } from "../controls/ObjectDock";
import { Modal } from "../panels/Modal";

export function SearchDialog() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CelestialObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    const timer = window.setTimeout(() => {
      celestialService
        .search(query, { signal: controller.signal })
        .then((objects) => {
          if (!controller.signal.aborted) {
            setResults(objects);
            setBusy(false);
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Search is unavailable. Please try again.",
            );
            setBusy(false);
          }
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const selectObject = useExplorationStore((s) => s.selectObject);
  return (
    <Modal
      title="Where will you go?"
      eyebrow="FIND YOUR NEXT PERSPECTIVE"
      className="search-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !error && results[0]) selectObject(results[0].id);
        }}
      >
        <label className="search-input">
          <Search size={20} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search planets, moons, our star…"
            aria-label="Search celestial objects"
            autoComplete="off"
            maxLength={100}
          />
          <kbd>ESC</kbd>
        </label>
      </form>
      <div className="search-result-heading">
        <span>{query ? "SEARCH RESULTS" : "OUR SOLAR SYSTEM"}</span>
        <span>
          {busy
            ? "SEARCHING…"
            : `${results.length} ${results.length === 1 ? "OBJECT" : "OBJECTS"}`}
        </span>
      </div>
      <div
        className="search-results"
        aria-label="Search results"
        aria-busy={busy}
      >
        {error ? (
          <p className="empty-state" role="alert">
            {error}
          </p>
        ) : !busy && results.length === 0 ? (
          <div className="empty-state">
            <Search size={28} />
            <h3>No objects found</h3>
            <p>Try Earth, Moon, Mars, or another Solar System object.</p>
          </div>
        ) : (
          results.map((object) => (
            <button
              key={object.id}
              className="search-result"
              disabled={busy}
              onClick={() => selectObject(object.id)}
            >
              <PlanetSwatch object={object} />
              <span>
                <strong>{object.name}</strong>
                <small>{object.category}</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))
        )}
      </div>
      <div className="modal-footer">
        <span>10 real objects. Countless perspectives.</span>
        <span>↵ to travel</span>
      </div>
    </Modal>
  );
}
