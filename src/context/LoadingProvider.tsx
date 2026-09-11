import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Loading from "../components/Loading";

interface LoadingType {
  isLoading: boolean;
  setIsLoading: (state: boolean) => void;
  setLoading: (percent: number) => void;
}

export const LoadingContext = createContext<LoadingType | null>(null);

// Module-scoped (not component state) so it survives React unmounting/
// remounting this provider when navigating away from "/" and back within the
// same SPA session - without this, every return to the home page replayed
// the full loading screen and 3D intro from scratch.
let hasPlayedIntro = false;

export const LoadingProvider = ({ children }: PropsWithChildren) => {
  const skipIntroRef = useRef(window.innerWidth <= 768 || hasPlayedIntro);
  const [isLoading, setIsLoading] = useState(!skipIntroRef.current);
  const [loading, setLoading] = useState(0);

  const value = {
    isLoading,
    setIsLoading,
    setLoading,
  };
  useEffect(() => {
    // Auto-start animations when there's no loading screen to trigger them:
    // no 3D model on mobile, or we've already played the intro once this
    // session and are skipping straight to the "loaded" state.
    if (skipIntroRef.current) {
      import("../components/utils/initialFX").then((module) => {
        if (module.initialFX) {
          setTimeout(() => {
            module.initialFX();
          }, 100);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      hasPlayedIntro = true;
    }
  }, [isLoading]);

  useEffect(() => {}, [loading]);

  return (
    <LoadingContext.Provider value={value as LoadingType}>
      {isLoading && <Loading percent={loading} />}
      <main className="main-body">{children}</main>
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};
