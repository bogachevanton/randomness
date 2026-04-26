;; RNG Operator | Strike | v.1.0.0
;; skullco.in

;; Traits
(use-trait rng-operator-trait .rng-traits-v1.rng-operator-trait)
(use-trait rng-core-trait .rng-traits-v1.rng-core-trait)

;; Constants and Errors
(define-constant ERR-NOT-AUTHORIZED (err u501))
(define-constant ERR-REQUEST-NOT-FOUND (err u502))
(define-constant ERR-ALREADY-RESOLVED (err u503))
(define-constant ERR-INVALID-STATE (err u504))
(define-constant ERR-ZERO-MAX (err u505))
(define-constant ERR-INVALID-MODE (err u506))
(define-constant ERR-INVALID-CORE (err u507))
(define-constant MODE-FAST u1)
(define-constant MODE-NEXT-TENURE u2)

;; Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var rng-core principal .rng-core-v1)
(define-data-var last-request-id uint u0)
(define-data-var last-random uint u0)

;; Storage
(define-map results
  { request-id: uint }
  {
    requester: principal,
    resolved: bool,
    randomness: (optional uint)
  }
)

;; -------------------------
;; Read-only
;; -------------------------

(define-read-only (get-owner)
  (ok (var-get contract-owner)))

(define-read-only (get-last-request-id)
  (ok (var-get last-request-id)))

(define-read-only (get-last-random)
  (ok (var-get last-random)))

(define-read-only (get-rng-core)
  (ok (var-get rng-core)))

(define-read-only (get-result (request-id uint))
  (match (map-get? results { request-id: request-id })
    result (ok result)
    ERR-REQUEST-NOT-FOUND
  )
)

(define-read-only (get-result-in-range (request-id uint) (max uint))
  (begin
    (asserts! (> max u0) ERR-ZERO-MAX)
    (match (map-get? results { request-id: request-id })
      result
        (match (get randomness result)
          randomness (ok (mod randomness max))
          ERR-INVALID-STATE
        )
      ERR-REQUEST-NOT-FOUND
    )
  )
)

;; -------------------------
;; Admin
;; -------------------------

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)))

(define-public (set-rng-core (new-core principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set rng-core new-core)
    (ok true)))

;; -------------------------
;; User flow
;; -------------------------

;; Caller must pass .rng-operator-v1 as 'self'
(define-public (request-rng (core <rng-core-trait>) (self <rng-operator-trait>) (mode uint))
  (begin
    (asserts! (is-eq (contract-of core) (var-get rng-core)) ERR-INVALID-CORE)
    (asserts! (is-mode-valid mode) ERR-INVALID-MODE)
    (let
      (
        (request-id
          (try!
            (contract-call? core request-randomness self mode)
          )
        )
      )
      (map-set results
        { request-id: request-id }
        {
          requester: tx-sender,
          resolved: false,
          randomness: none
        }
      )
      (var-set last-request-id request-id)
      (print {
        event: "operator-requested-rng",
        request-id: request-id,
        requester: tx-sender,
        mode: mode
      })
      (ok request-id)
    )
  )
)

(define-public (request-rng-now (core <rng-core-trait>) (self <rng-operator-trait>))
  (begin
    (asserts! (is-eq (contract-of core) (var-get rng-core)) ERR-INVALID-CORE)
    (let
      (
        (request-id (try! (request-rng core self MODE-FAST)))
      )
      (begin
        (try!
          (contract-call? core finalize-randomness request-id self)
        )
        (ok request-id)
      )
    )
  )
)

(define-public (request-rng-next-tenure (core <rng-core-trait>) (self <rng-operator-trait>))
  (request-rng core self MODE-NEXT-TENURE))

(define-public (finalize-request (request-id uint) (core <rng-core-trait>) (self <rng-operator-trait>))
  (begin
    (asserts! (is-eq (contract-of core) (var-get rng-core)) ERR-INVALID-CORE)
    (contract-call? core finalize-randomness request-id self)))

(define-public (receive-randomness (request-id uint) (randomness uint))
  (let
    (
      (entry (unwrap! (map-get? results { request-id: request-id }) ERR-REQUEST-NOT-FOUND))
    )
    (begin
      (asserts! (not (get resolved entry)) ERR-ALREADY-RESOLVED)
      (map-set results
        { request-id: request-id }
        {
          requester: (get requester entry),
          resolved: true,
          randomness: (some randomness)
        }
      )
      (var-set last-random randomness)
      (print {
        event: "operator-received-rng",
        request-id: request-id,
        randomness: randomness
      })
      (ok true)
    )
  )
)

;; -------------------------
;; Private
;; -------------------------

(define-private (is-mode-valid (mode uint))
  (or (is-eq mode MODE-FAST) (is-eq mode MODE-NEXT-TENURE)))