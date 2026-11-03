import { Mouse, Move3D, Smartphone } from "lucide-react";
import { Modal } from "./Modal";

export function HelpDialog() {
  return (
    <Modal
      title="A universe at your fingertips."
      eyebrow="FLIGHT MANUAL"
      className="help-dialog"
    >
      <p className="modal-intro">
        Search for an object, choose a destination in Solar System Overview, or
        explore with the camera controls.
      </p>
      <div className="help-section">
        <h3>
          <Mouse size={18} />
          Mouse & trackpad
        </h3>
        <dl>
          <div>
            <dt>Rotate your view</dt>
            <dd>Left drag</dd>
          </div>
          <div>
            <dt>Pan across space</dt>
            <dd>Right drag</dd>
          </div>
          <div>
            <dt>Move closer or further</dt>
            <dd>Scroll</dd>
          </div>
          <div>
            <dt>Select / travel to an object</dt>
            <dd>Click / double-click</dd>
          </div>
        </dl>
      </div>
      <div className="help-section">
        <h3>
          <Move3D size={18} />
          Keyboard
        </h3>
        <dl>
          <div>
            <dt>Move through space</dt>
            <dd>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
            </dd>
          </div>
          <div>
            <dt>Move down / up</dt>
            <dd>
              <kbd>Q</kbd>
              <kbd>E</kbd>
            </dd>
          </div>
          <div>
            <dt>Search / exit focus</dt>
            <dd>
              <kbd>/</kbd>
              <kbd>Esc</kbd>
            </dd>
          </div>
        </dl>
      </div>
      <div className="help-section">
        <h3>
          <Smartphone size={18} />
          Touch
        </h3>
        <dl>
          <div>
            <dt>Rotate / pan</dt>
            <dd>One / two-finger drag</dd>
          </div>
          <div>
            <dt>Zoom / travel</dt>
            <dd>Pinch / double tap</dd>
          </div>
        </dl>
      </div>
      <p className="settings-note">
        Click or tap the viewport before using movement keys. Orbit camera
        circles your target. Free flight lets you look around from your current
        position; pinch or scroll to move. Reset view reframes the current world
        in Exploration or restores the full Solar System in Overview.
      </p>
    </Modal>
  );
}
