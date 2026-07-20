import { motion, AnimatePresence } from "framer-motion";

export function FireAnimation({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute"
          style={{ width: 80, height: 80 }}
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,184,0,0.95)_0%,rgba(255,107,0,0.7)_40%,rgba(255,45,85,0)_70%)] flame-flicker" />
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              animate={{
                opacity: 0,
                x: Math.cos((i / 8) * Math.PI * 2) * 60,
                y: Math.sin((i / 8) * Math.PI * 2) * 60,
                scale: 0.2,
              }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--orange-alert)]"
              style={{ boxShadow: "0 0 8px var(--orange-alert)" }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}