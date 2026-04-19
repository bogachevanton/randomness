;; RNG Core | Strike | v.1.0.0
;; skullco.in

;; Traits
(use-trait rng-operator-trait .rng-traits-v1.rng-operator-trait)

;; Constants and Errors
(define-constant ERR-NOT-AUTHORIZED (err u401))
(define-constant ERR-INVALID-OPERATOR (err u402))
(define-constant ERR-REQUESTER-NOT-ALLOWED (err u403))
(define-constant ERR-REQUEST-NOT-FOUND (err u404))
(define-constant ERR-ALREADY-FINALIZED (err u405))
(define-constant ERR-REQUESTS-DISABLED (err u406))
(define-constant ERR-CALLBACK-FAILED (err u407))
(define-constant ERR-NO-VRF-SEED (err u408))
(define-constant ERR-INVALID-STATE (err u409))
(define-constant ERR-TOO-EARLY (err u410))
(define-constant ERR-ZERO-MAX (err u411))
(define-constant ERR-INVALID-MODE (err u412))
(define-constant MODE-FAST u1)
(define-constant MODE-NEXT-TENURE u2)

;; Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var requests-enabled bool true)
(define-data-var last-request-id uint u0)

;; Storage
(define-map allowed-operators principal bool)
(define-map allowed-requesters principal bool)
(define-map requests
  { request-id: uint }
  {
    operator: principal,
    requester: principal,
    requested-at: uint,
    mode: uint,
    target-height: uint,
    finalized: bool,
    randomness: (optional uint)
  }
)

;; -------------------------
;; Read-only
;; -------------------------

(define-read-only (get-owner)
  (ok (var-get contract-owner)))

(define-read-only (get-requests-enabled)
  (ok (var-get requests-enabled)))

(define-read-only (get-last-request-id)
  (ok (var-get last-request-id)))

(define-read-only (get-requester-allowed (requester principal))
  (ok (is-requester-allowed requester)))

(define-read-only (get-operator-allowed (operator principal))
  (ok (is-operator-allowed operator)))

(define-read-only (get-request (request-id uint))
  (match (map-get? requests { request-id: request-id })
    request (ok request)
    ERR-REQUEST-NOT-FOUND
  )
)

(define-read-only (get-randomness (request-id uint))
  (match (map-get? requests { request-id: request-id })
    request
      (match (get randomness request)
        randomness (ok randomness)
        ERR-INVALID-STATE
      )
    ERR-REQUEST-NOT-FOUND
  )
)

(define-read-only (get-randomness-in-range (request-id uint) (max uint))
  (begin
    (asserts! (> max u0) ERR-ZERO-MAX)
    (match (map-get? requests { request-id: request-id })
      request
        (match (get randomness request)
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
    (try! (assert-owner))
    (var-set contract-owner new-owner)
    (ok true)))

(define-public (flip-requests-enabled)
  (begin
    (try! (assert-owner))
    (var-set requests-enabled (not (var-get requests-enabled)))
    (ok (var-get requests-enabled))))

(define-public (set-requester-allowed (requester principal) (allowed bool))
  (begin
    (try! (assert-owner))
    (map-set allowed-requesters requester allowed)
    (ok true)))

(define-public (set-operator-allowed (operator principal) (allowed bool))
  (begin
    (try! (assert-owner))
    (map-set allowed-operators operator allowed)
    (ok true)))

;; -------------------------
;; Public flow
;; -------------------------

(define-public (request-randomness (operator <rng-operator-trait>) (mode uint))
  (begin
    (asserts! (var-get requests-enabled) ERR-REQUESTS-DISABLED)
    (asserts! (is-mode-valid mode) ERR-INVALID-MODE)
    (asserts! (is-eq tx-sender (contract-of operator)) ERR-INVALID-OPERATOR)
    (asserts! (is-operator-allowed (contract-of operator)) ERR-INVALID-OPERATOR)
    (asserts! (is-requester-allowed contract-caller) ERR-REQUESTER-NOT-ALLOWED)
    (let
      (
        (request-id (+ (var-get last-request-id) u1))
        (requested-at stacks-block-height)
        (target-height stacks-block-height)
      )
      (map-set requests
        { request-id: request-id }
        {
          operator: (contract-of operator),
          requester: contract-caller,
          requested-at: requested-at,
          mode: mode,
          target-height: target-height,
          finalized: false,
          randomness: none
        }
      )
      (var-set last-request-id request-id)
      (print {
        event: "rng-requested",
        request-id: request-id,
        operator: (contract-of operator),
        requester: contract-caller,
        mode: mode,
        target-height: target-height
      })
      (ok request-id)
    )
  )
)

(define-public (finalize-randomness (request-id uint) (operator <rng-operator-trait>))
  (let
    (
      (request (unwrap! (map-get? requests { request-id: request-id }) ERR-REQUEST-NOT-FOUND))
    )
    (begin
      (asserts! (not (get finalized request)) ERR-ALREADY-FINALIZED)
      (asserts! (is-eq (contract-of operator) (get operator request)) ERR-INVALID-OPERATOR)
      (let
        (
          (randomness
            (try!
              (derive-randomness
                request-id
                (get requested-at request)
                (get mode request)
                (get target-height request)
              )
            )
          )
        )
        (map-set requests
          { request-id: request-id }
          {
            operator: (get operator request),
            requester: (get requester request),
            requested-at: (get requested-at request),
            mode: (get mode request),
            target-height: (get target-height request),
            finalized: true,
            randomness: (some randomness)
          }
        )
        (unwrap!
          (contract-call? operator receive-randomness request-id randomness)
          ERR-CALLBACK-FAILED
        )
        (print {
          event: "rng-finalized",
          request-id: request-id,
          mode: (get mode request),
          randomness: randomness
        })
        (ok randomness)
      )
    )
  )
)

;; -------------------------
;; Private
;; -------------------------

(define-private (assert-owner)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (ok true)))

(define-private (is-mode-valid (mode uint))
  (or (is-eq mode MODE-FAST) (is-eq mode MODE-NEXT-TENURE)))

(define-private (is-requester-allowed (requester principal))
  (default-to false (map-get? allowed-requesters requester)))

(define-private (is-operator-allowed (operator principal))
  (default-to false (map-get? allowed-operators operator)))

(define-private (buff32-to-u32 (src (buff 32)))
  (let
    (
      (b0 (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? src u0 u1)) u16))))
      (b1 (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? src u1 u2)) u16))))
      (b2 (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? src u2 u3)) u16))))
      (b3 (buff-to-uint-be (unwrap-panic (as-max-len? (unwrap-panic (slice? src u3 u4)) u16))))
    )
    (ok
      (+ (* b0 u16777216)
         (* b1 u65536)
         (* b2 u256)
         b3)
    )
  )
)

(define-private (resolve-seed-height (mode uint) (target-height uint))
  (if (is-eq mode MODE-FAST)
      (ok (- stacks-block-height u1))
      (if (is-eq mode MODE-NEXT-TENURE)
          (begin
            (asserts! (> stacks-block-height target-height) ERR-TOO-EARLY)
            (ok target-height)
          )
          ERR-INVALID-MODE))
)

(define-private (derive-randomness (request-id uint) (requested-at uint) (mode uint) (target-height uint))
  (let
    (
      (seed-height (try! (resolve-seed-height mode target-height)))
      (seed (unwrap! (get-tenure-info? vrf-seed seed-height) ERR-NO-VRF-SEED))
      (h1 (sha512/256 (concat seed (unwrap-panic (to-consensus-buff? request-id)))))
      (h2 (sha512/256 (concat h1 (unwrap-panic (to-consensus-buff? requested-at)))))
      (h3 (sha512/256 (concat h2 (unwrap-panic (to-consensus-buff? target-height)))))
      (h4 (sha512/256 (concat h3 (unwrap-panic (to-consensus-buff? mode)))))
    )
    (buff32-to-u32 h4)
  )
)