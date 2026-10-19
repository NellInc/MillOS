import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a screen-reader live region at document.body. A compact sheet makes
 * the HUD root aria-hidden and inert, which removes everything inside it from
 * the accessibility tree: a live region there is never announced, and nothing
 * reads it again when the sheet closes. The portal keeps one stable node, so
 * its text still changes in place and is announced.
 * Working if alerts, PA notices and the emergency banner are announced while a
 * phone sheet is open, each exactly once.
 */
export const LiveRegionPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(children, document.body);
