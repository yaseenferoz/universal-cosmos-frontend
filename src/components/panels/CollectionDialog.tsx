import { ArrowUpRight, Orbit, Telescope } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { Modal } from "./Modal";

const descriptions: Record<string, string> = {
  Stars:
    "Beyond our Sun are billions of stars. A catalog of nearby stellar systems is planned for a future expansion.",
  Galaxies:
    "Islands of stars, gas, and dark matter. Interactive galaxy exploration is planned for a future expansion.",
  Nebulae:
    "Vast clouds where stars are born and leave their last light. Nebula catalogs are planned for a future expansion.",
  "Deep space":
    "There is much more beyond our cosmic neighborhood. Deep-space catalogs are planned for a future expansion.",
};

export function CollectionDialog() {
  const collection = useExplorationStore((s) => s.collection);
  return (
    <Modal
      title={collection}
      eyebrow="BEYOND THE SOLAR SYSTEM"
      className="collection-dialog"
    >
      <div className="collection-art">
        <Telescope size={64} strokeWidth={0.7} />
      </div>
      <span className="coming-label">ON THE HORIZON</span>
      <p className="collection-description">{descriptions[collection]}</p>
      <p className="collection-note">
        This release explores the Sun, eight planets, and Earth’s Moon.
        Background stars are a procedural illustration, not a searchable star
        catalog.
      </p>
      <button
        className="travel-button"
        onClick={() => useExplorationStore.getState().setViewMode("overview")}
      >
        <Orbit size={18} />
        <span>Explore the Solar System</span>
        <ArrowUpRight size={17} />
      </button>
    </Modal>
  );
}
