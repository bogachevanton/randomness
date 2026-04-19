;; RNG Traits | Strike | v.1.0.0
;; skullco.in

(define-trait rng-operator-trait
  (
    (receive-randomness (uint uint) (response bool uint))
  )
)

(define-trait rng-core-trait
  (
    (request-randomness (<rng-operator-trait> uint) (response uint uint))
    (finalize-randomness (uint <rng-operator-trait>) (response uint uint))
  )
)
