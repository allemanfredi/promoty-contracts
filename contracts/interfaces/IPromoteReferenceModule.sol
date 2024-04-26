// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IReferenceModule } from "@lens-protocol/core/contracts/interfaces/IReferenceModule.sol";

interface IPromoteReferenceModule is IReferenceModule {
    struct Reward {
        address asset;
        uint256 amount;
        uint256 expiresAt;
    }

    event ExpiredRewardClaimed(
        uint256 indexed creatorProfileId,
        uint256 indexed pubId,
        uint256 indexed collectorProfileId,
        address asset,
        uint256 amount,
        uint256 expiresAt
    );

    event Promoted(
        uint256 indexed creatorProfileId,
        uint256 indexed pubId,
        uint256 indexed collectorProfileId,
        address asset,
        uint256 amount,
        uint256 expiresAt
    );

    event RewardCollected(
        uint256 indexed creatorProfileId,
        uint256 indexed pubId,
        uint256 indexed collectorProfileId,
        address asset,
        uint256 amount,
        uint256 expiresAt
    );

    error AmountCannotBeZero();
    error CannotAssignDoubleRewardToTheSameProfile(uint256 profileId);
    error RewardNotExpired();
    error RewardNotFound();

    function getAccruedFeesByAsset(address asset) external view returns (uint256);

    function getReward(
        uint256 creatorProfileId,
        uint256 pubId,
        uint256 collectorProfileId
    ) external view returns (Reward memory);

    function withdrawAccruedFeesByAsset(address asset, address receiver) external;
}
