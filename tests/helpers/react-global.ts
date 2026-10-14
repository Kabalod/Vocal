// tsx compiles .tsx with the classic JSX transform (tsconfig jsx: preserve): `React` must be in scope for components that do not import it.
import React from "react";

(globalThis as { React?: typeof React }).React = React;
