import { useStore } from "../store";

export default function Toast() {
  const { state } = useStore();
  return <div className={`toast ${state.toast ? "show" : ""}`}>{state.toast}</div>;
}
