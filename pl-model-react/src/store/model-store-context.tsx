import { createContext, useContext, useRef, type PropsWithChildren } from 'react';
import { useStore } from 'zustand';
import { createModelStore, type InitialActualsMode, type ModelStore } from './model-store';

type ModelStoreApi = ReturnType<typeof createModelStore>;
const ModelStoreContext = createContext<ModelStoreApi | null>(null);

export function ModelStoreProvider({ children, initialActuals = 'empty' }: PropsWithChildren<{ initialActuals?: InitialActualsMode }>) {
  const storeRef = useRef<ModelStoreApi | null>(null);
  if (!storeRef.current) storeRef.current = createModelStore(window.PL_SUBSIDY_PROGRAM, { initialActuals });
  return <ModelStoreContext.Provider value={storeRef.current}>{children}</ModelStoreContext.Provider>;
}

export function useModelStore<T>(selector: (state: ModelStore) => T): T {
  const store = useContext(ModelStoreContext);
  if (!store) throw new Error('ModelStoreProviderが必要です');
  return useStore(store, selector);
}
