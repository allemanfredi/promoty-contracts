// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPromoty {
    struct Reward {
        uint256 amount;
        uint256 expiresAt;
        uint256 expiredReceiverFid;
    }

    event ExpiredRewardClaimed(bytes20 indexed messageHash, uint256 indexed expiredReceiverFid, uint256 reward);
    event IdRegistrySet(address idRegistry);
    event RewardClaimed(bytes20 indexed messageHash, uint256 indexed recasterFid, uint256 reward);
    event RecastRewarded(
        bytes20 indexed messageHash,
        uint256 indexed creatorFid,
        uint256 indexed recasterFid,
        uint256 reward,
        uint256 duration
    );

    error FailedToSendExpiredReward();
    error FailedToSendReward();
    error FailedToWithdraw();
    error InvalidSignature();
    error InvalidEncoding();
    error InvalidFid();
    error InvalidMessageType();
    error InvalidValue();
    error NoReward();
    error NothingToWithdraw();
    error RewardExpired();
    error RewardNotExpired();

    function claimExpiredReward(
        bytes32 publicKey,
        bytes32 r,
        bytes32 s,
        bytes memory message,
        uint256 recasterFid
    ) external;

    function claimReward(bytes32 publicKey, bytes32 r, bytes32 s, bytes memory message) external;

    function rewardRecast(
        bytes32 publicKey,
        bytes32 r,
        bytes32 s,
        bytes memory message,
        uint256 recasterFid,
        uint256 expiredReceiverFid,
        uint64 duration
    ) external payable;

    function setIdRegistry(address idRegistry_) external;

    function withdrawAll(address receiver) external;
}
