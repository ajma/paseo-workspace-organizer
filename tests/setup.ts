import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetWorkspaceHistory } from "../client/history";
import { resetCopies } from "../client/sidebar-placement";
afterEach(() => { cleanup(); resetWorkspaceHistory(); resetCopies(); });
