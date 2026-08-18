import {
  createContext,
  useContext,
  useLayoutEffect,
  type RefObject,
} from 'react'

export interface ProjectionFieldContextValue {
  register: (node: HTMLElement) => () => void
}

export const ProjectionFieldContext = createContext<ProjectionFieldContextValue | null>(null)

export function useInstrumentProjectionTarget<T extends HTMLElement>(ref: RefObject<T>) {
  const field = useContext(ProjectionFieldContext)

  useLayoutEffect(() => {
    const node = ref.current
    if (!field || !node) return
    return field.register(node)
  }, [field, ref])
}
