export const createClipMembershipSettlementHandler = ({ getAuth, getUserByClerkId, settleYoutubeClipMembership }) => async (req, res) => {
    try {
        const auth = getAuth(req);
        if (!auth.userId) return res.status(401).json({ status: 'error', error: { code: 'UNAUTHORIZED' } });
        const { usageEventId, success } = req.body || {};
        if (!Number.isSafeInteger(usageEventId) || usageEventId <= 0 || typeof success !== 'boolean') {
            return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT' } });
        }
        const user = await getUserByClerkId(auth.userId);
        if (!user) return res.status(404).json({ status: 'error', error: { code: 'USER_NOT_SYNCED' } });
        if (user.is_disabled) return res.status(403).json({ status: 'error', error: { code: 'USER_DISABLED' } });
        const result = await settleYoutubeClipMembership({ userId: user.id, usageEventId, success });
        if (!result.ok) return res.status(409).json({ status: 'error', error: { code: 'SETTLEMENT_UNAVAILABLE' } });
        return res.json({ status: 'success', data: { status: result.status } });
    } catch {
        return res.status(500).json({ status: 'error', error: { code: 'SERVER_ERROR' } });
    }
};
