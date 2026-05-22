# SIU Investigator Re-verification Workflow Plan

Currently, both Adjusters and SIU Investigators can finalize claims (approving, rejecting, or partially approving them). The requested workflow is that all adjuster decisions must act as recommendations, escalating the claim to the SIU Investigator for final re-verification. The SIU Investigator then performs the final decision, which updates the policyholder's status.

## User Review Required

> [!IMPORTANT]
> - Adjusters will no longer have the authority to finalize claims. Their actions will save recommendations and shift the claim to the `escalated_siu` status.
> - The claimant (policyholder) will see that their claim is under re-verification with status `SIU Review`.
> - Button labels in the Review Drawer will dynamically change based on user role (e.g., "Recommend Approval" for Adjusters vs. "Approve & Settle" for SIU Investigators).

## Open Questions

None at this stage. The requirements are fully detailed.

## Proposed Changes

---

### Backend Components

#### [MODIFY] [claims_controller.py](file:///d:/Agent/Agent-6/Claims_Automation_Agent/API/app/controllers/claims_controller.py)
- Update `ClaimOut` schema to return:
  - `adjuster_recommended_action: Optional[str] = None`
  - `adjuster_recommended_amount: Optional[float] = None`
  - `adjuster_recommended_notes: Optional[str] = None`
- Update `claim_decision` controller endpoint:
  - Enforce role-based checks:
    - Adjusters can only decide on claims with status `escalated_adjuster`.
    - SIU Investigators can only decide on claims with status `escalated_siu`.
  - For `adjuster` role:
    - Save recommendations: `adjuster_recommended_action = payload.action`, `adjuster_recommended_amount = payload.amount`, and `adjuster_recommended_notes = payload.notes`.
    - Transition claim status to `escalated_siu`.
    - Send an email and notification update to the claimant stating the claim is undergoing re-verification.
    - Trigger escalation notification using `notify_claim_escalation(db, claim)` to alert SIU investigators of the pending review.
  - For `siu_investigator` role:
    - Process the decision as a final action (approve/reject/partial_approve).
    - Transition claim status to `settled` or `rejected`.
    - Create/update `Settlement` records and issue claimant notifications.

---

### Frontend Components

#### [MODIFY] [ClaimReviewDrawer.jsx](file:///d:/Agent/Agent-6/Claims_Automation_Agent/UI/src/components/ClaimReviewDrawer.jsx)
- Import `useAuthStore` to identify the current logged-in user's role.
- Adjust button labels depending on the viewer's role:
  - Adjuster: "Recommend Approval", "Recommend Partial Approval", "Recommend Rejection".
  - SIU Investigator / Supervisor: "Approve & Settle", "Partially Approve", "Reject Claim".
- Display the adjuster's recommendation details prominently (using a styled banner/card) in the drawer if the claim contains `adjuster_recommended_action` (relevant to SIU and Supervisor reviewers).

---

## Verification Plan

### Manual Verification
1. Log in as Adjuster, click "Review" on an escalated claim.
2. Verify buttons display recommendation-oriented text.
3. Submit an action (e.g. Recommend Partial Approval of ₹10,000 with notes).
4. Verify the claim is removed from the Adjuster's queue.
5. Log in as SIU Investigator.
6. Verify the claim appears in the SIU queue.
7. Open the review drawer for the claim.
8. Verify that the Adjuster's recommendation details are clearly displayed.
9. Click "Approve & Settle" as SIU.
10. Log in as Policyholder, verify final status has updated to "Settled" / "Partially Approved" under claims history.
