import { time } from "@nomicfoundation/hardhat-network-helpers"
import { Factories, FarcasterNetwork, MessageData, MessageType, ReactionType } from "@farcaster/core"
import { expect } from "chai"
import { ethers } from "hardhat"
import { signFarcasterMessage, hashMessage } from "./utils/farcaster-message"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"

const HASH = Buffer.from("1111111111111111111111111111111111111111", "hex")
const INFLUENCER_FID = 10
const USER_FID = 1
const WRONG_FID = 11
const EXPIRED_RECEIVER_FID = 12

const ed25519Signer = Factories.Ed25519Signer.build()
const ed25519Influencer = Factories.Ed25519Signer.build()

describe("Promoty", () => {
  let messageDataToRecast: MessageData
  let promoty: any,
    idRegistry: any,
    relayer: any,
    influencer: SignerWithAddress,
    owner: SignerWithAddress,
    expiredReceiver: SignerWithAddress

  beforeEach(async () => {
    const Blake3 = await ethers.getContractFactory("Blake3")
    const Ed25519_pow = await ethers.getContractFactory("Ed25519_pow")
    const blake3 = await Blake3.deploy()
    const ed25519Pow = await Ed25519_pow.deploy()
    const Sha512 = await ethers.getContractFactory("Sha512")
    const sha512 = await Sha512.deploy()
    const Ed25519 = await ethers.getContractFactory("Ed25519", {
      libraries: {
        Ed25519_pow: ed25519Pow.target,
        Sha512: sha512.target,
      },
    })
    const ed25519 = await Ed25519.deploy()

    const Promoty = await ethers.getContractFactory("Promoty", {
      libraries: {
        Blake3: blake3.target,
        Ed25519: ed25519.target,
      },
    })
    const MockIdRegistry = await ethers.getContractFactory("MockIdRegistry")

    const signers = await ethers.getSigners()
    owner = signers[0]
    influencer = signers[1]
    relayer = signers[2]
    expiredReceiver = signers[3]

    idRegistry = await MockIdRegistry.deploy()
    promoty = await Promoty.deploy(await idRegistry.getAddress())

    await idRegistry.setAddressForFid(INFLUENCER_FID, influencer.address)
    await idRegistry.setAddressForFid(USER_FID, owner.address)
    await idRegistry.setAddressForFid(EXPIRED_RECEIVER_FID, expiredReceiver.address)

    messageDataToRecast = {
      type: MessageType.CAST_ADD,
      fid: USER_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      castAddBody: {
        embedsDeprecated: [],
        mentions: [1],
        parentCastId: {
          fid: 0,
          hash: HASH,
        },
        text: "hello",
        mentionsPositions: [1],
        embeds: [],
      },
    }
  })

  it("should be able to get a reward on a recast", async () => {
    const reward = ethers.parseEther("1")
    const recasterReward = ethers.parseEther("0.995")
    const fee = ethers.parseEther("0.005")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()
    const hashMessageDataToRecast = await hashMessage(message)

    await expect(
      promoty.rewardRecast(pubKey, signature.r, signature.s, message, INFLUENCER_FID, EXPIRED_RECEIVER_FID, duration, {
        value: reward,
      }),
    )
      .to.emit(promoty, "RecastRewarded")
      .withArgs("0x" + hashMessageDataToRecast.toString("hex"), USER_FID, INFLUENCER_FID, reward, duration)

    const messageDataToClaimReward: MessageData = {
      type: MessageType.REACTION_ADD,
      fid: INFLUENCER_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      reactionBody: {
        type: ReactionType.RECAST,
        targetCastId: {
          hash: hashMessageDataToRecast,
          fid: USER_FID,
        },
      },
    }

    signature = await signFarcasterMessage(ed25519Influencer, messageDataToClaimReward)
    pubKey = (await ed25519Influencer.getSignerKey())._unsafeUnwrap()
    message = MessageData.encode(messageDataToClaimReward).finish()
    const messageDataToClaimRewardHash = await hashMessage(message)

    const balanceBeforeRecaster = await ethers.provider.getBalance(influencer.address)
    const balanceBeforeReceiver = await ethers.provider.getBalance(expiredReceiver.address)
    await expect(promoty.connect(relayer).claimReward(pubKey, signature.r, signature.s, message))
      .to.emit(promoty, "RewardClaimed")
      .withArgs("0x" + messageDataToClaimRewardHash.toString("hex"), INFLUENCER_FID, recasterReward)
    const balanceAfterRecaster = await ethers.provider.getBalance(influencer.address)
    expect(balanceAfterRecaster).to.be.eq(balanceBeforeRecaster + recasterReward)
    await promoty.withdrawAll(expiredReceiver.address)
    const balanceAfterReceiver = await ethers.provider.getBalance(expiredReceiver.address)
    expect(balanceAfterReceiver).to.be.eq(balanceBeforeReceiver + fee)
  })

  it("should be able to get a reward on a quote", async () => {
    const reward = ethers.parseEther("1")
    const recasterReward = ethers.parseEther("0.995")
    const fee = ethers.parseEther("0.005")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()
    const hashMessageDataToRecast = await hashMessage(message)

    await expect(
      promoty.rewardRecast(pubKey, signature.r, signature.s, message, INFLUENCER_FID, EXPIRED_RECEIVER_FID, duration, {
        value: reward,
      }),
    )
      .to.emit(promoty, "RecastRewarded")
      .withArgs("0x" + hashMessageDataToRecast.toString("hex"), USER_FID, INFLUENCER_FID, reward, duration)

    const messageDataToClaimReward: MessageData = {
      type: MessageType.CAST_ADD,
      fid: INFLUENCER_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      castAddBody: {
        embedsDeprecated: [],
        mentions: [1],
        text: "Quoting ...",
        mentionsPositions: [1],
        embeds: [
          {
            castId: {
              fid: USER_FID,
              hash: hashMessageDataToRecast,
            },
          },
        ],
      },
    }

    signature = await signFarcasterMessage(ed25519Influencer, messageDataToClaimReward)
    pubKey = (await ed25519Influencer.getSignerKey())._unsafeUnwrap()
    message = MessageData.encode(messageDataToClaimReward).finish()
    const messageDataToClaimRewardHash = await hashMessage(message)

    const balanceBeforeRecaster = await ethers.provider.getBalance(influencer.address)
    const balanceBeforeReceiver = await ethers.provider.getBalance(expiredReceiver.address)
    await expect(promoty.connect(relayer).claimReward(pubKey, signature.r, signature.s, message))
      .to.emit(promoty, "RewardClaimed")
      .withArgs("0x" + messageDataToClaimRewardHash.toString("hex"), INFLUENCER_FID, recasterReward)
    const balanceAfterRecaster = await ethers.provider.getBalance(influencer.address)
    expect(balanceAfterRecaster).to.be.eq(balanceBeforeRecaster + recasterReward)
    await promoty.withdrawAll(expiredReceiver.address)
    const balanceAfterReceiver = await ethers.provider.getBalance(expiredReceiver.address)
    expect(balanceAfterReceiver).to.be.eq(balanceBeforeReceiver + fee)
  })

  it("should be able to get a reward on a recast rewarded 2 times", async () => {
    const reward = ethers.parseEther("1")
    const recasterReward = ethers.parseEther("0.995")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()
    const hashMessageDataToRecast = await hashMessage(message)

    await promoty.rewardRecast(
      pubKey,
      signature.r,
      signature.s,
      message,
      INFLUENCER_FID,
      EXPIRED_RECEIVER_FID,
      duration,
      {
        value: reward,
      },
    )
    await promoty.rewardRecast(
      pubKey,
      signature.r,
      signature.s,
      message,
      INFLUENCER_FID,
      EXPIRED_RECEIVER_FID,
      duration,
      {
        value: reward,
      },
    )

    const messageDataToClaimReward: MessageData = {
      type: MessageType.REACTION_ADD,
      fid: INFLUENCER_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      reactionBody: {
        type: ReactionType.RECAST,
        targetCastId: {
          hash: hashMessageDataToRecast,
          fid: USER_FID,
        },
      },
    }

    signature = await signFarcasterMessage(ed25519Influencer, messageDataToClaimReward)
    pubKey = (await ed25519Influencer.getSignerKey())._unsafeUnwrap()
    message = MessageData.encode(messageDataToClaimReward).finish()
    const messageDataToClaimRewardHash = await hashMessage(message)

    const balanceBeforeRecaster = await ethers.provider.getBalance(influencer.address)
    await expect(promoty.connect(relayer).claimReward(pubKey, signature.r, signature.s, message))
      .to.emit(promoty, "RewardClaimed")
      .withArgs("0x" + messageDataToClaimRewardHash.toString("hex"), INFLUENCER_FID, recasterReward + recasterReward)
    const balanceAfterRecaster = await ethers.provider.getBalance(influencer.address)
    expect(balanceAfterRecaster).to.be.eq(balanceBeforeRecaster + recasterReward + recasterReward)
  })

  it("should not be able to get a reward on a recast because the specified fid is not registered", async () => {
    const reward = ethers.parseEther("1")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()
    const hashMessageDataToRecast = await hashMessage(message)

    await expect(
      promoty.rewardRecast(pubKey, signature.r, signature.s, message, WRONG_FID, EXPIRED_RECEIVER_FID, duration, {
        value: reward,
      }),
    )
      .to.emit(promoty, "RecastRewarded")
      .withArgs("0x" + hashMessageDataToRecast.toString("hex"), USER_FID, WRONG_FID, reward, duration)

    const messageDataToClaimReward: MessageData = {
      type: MessageType.REACTION_ADD,
      fid: WRONG_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      reactionBody: {
        type: ReactionType.RECAST,
        targetCastId: {
          hash: hashMessageDataToRecast,
          fid: USER_FID,
        },
      },
    }

    signature = await signFarcasterMessage(ed25519Influencer, messageDataToClaimReward)
    pubKey = (await ed25519Influencer.getSignerKey())._unsafeUnwrap()
    message = MessageData.encode(messageDataToClaimReward).finish()

    await expect(
      promoty.connect(relayer).claimReward(pubKey, signature.r, signature.s, message),
    ).to.be.revertedWithCustomError(promoty, "InvalidFid")
  })

  it("should not be able to get a reward if a normal cast is provided", async () => {
    const reward = ethers.parseEther("1")
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()

    await promoty.rewardRecast(
      pubKey,
      signature.r,
      signature.s,
      message,
      INFLUENCER_FID,
      EXPIRED_RECEIVER_FID,
      1000 * 60 * 60,
      {
        value: reward,
      },
    ),
      await expect(
        promoty.connect(relayer).claimReward(pubKey, signature.r, signature.s, message),
      ).to.be.revertedWithCustomError(promoty, "NoReward")
  })

  it("should not be able to get a reward on a recast if a reward is expired", async () => {
    const reward = ethers.parseEther("1")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()
    const hashMessageDataToRecast = await hashMessage(message)

    await expect(
      promoty.rewardRecast(pubKey, signature.r, signature.s, message, INFLUENCER_FID, EXPIRED_RECEIVER_FID, duration, {
        value: reward,
      }),
    )
      .to.emit(promoty, "RecastRewarded")
      .withArgs("0x" + hashMessageDataToRecast.toString("hex"), USER_FID, INFLUENCER_FID, reward, duration)

    await time.increase(duration + 1)
    const messageDataToClaimReward: MessageData = {
      type: MessageType.REACTION_ADD,
      fid: INFLUENCER_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      reactionBody: {
        type: ReactionType.RECAST,
        targetCastId: {
          hash: hashMessageDataToRecast,
          fid: USER_FID,
        },
      },
    }

    signature = await signFarcasterMessage(ed25519Influencer, messageDataToClaimReward)
    pubKey = (await ed25519Influencer.getSignerKey())._unsafeUnwrap()
    message = MessageData.encode(messageDataToClaimReward).finish()
    await expect(
      promoty.connect(relayer).claimReward(pubKey, signature.r, signature.s, message),
    ).to.be.revertedWithCustomError(promoty, "RewardExpired")
  })

  it("should be able to claim an expired reward", async () => {
    const reward = ethers.parseEther("1")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()
    const hashMessageDataToRecast = await hashMessage(message)

    await promoty.rewardRecast(
      pubKey,
      signature.r,
      signature.s,
      message,
      INFLUENCER_FID,
      EXPIRED_RECEIVER_FID,
      duration,
      {
        value: reward,
      },
    )

    const balanceBefore = await ethers.provider.getBalance(expiredReceiver.address)
    await time.increase(duration + 1)
    await expect(promoty.connect(relayer).claimExpiredReward(pubKey, signature.r, signature.s, message, INFLUENCER_FID))
      .to.emit(promoty, "ExpiredRewardClaimed")
      .withArgs("0x" + hashMessageDataToRecast.toString("hex"), EXPIRED_RECEIVER_FID, reward)
    const balanceAfter = await ethers.provider.getBalance(expiredReceiver.address)
    expect(balanceAfter).to.be.eq(balanceBefore + reward)
  })

  it("should not be able to claim a non expired reward", async () => {
    const reward = ethers.parseEther("1")
    const duration = 1000 * 60 * 60
    let signature = await signFarcasterMessage(ed25519Signer, messageDataToRecast)
    let pubKey = (await ed25519Signer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataToRecast).finish()

    await promoty.rewardRecast(
      pubKey,
      signature.r,
      signature.s,
      message,
      INFLUENCER_FID,
      EXPIRED_RECEIVER_FID,
      duration,
      {
        value: reward,
      },
    )

    await expect(
      promoty.claimExpiredReward(pubKey, signature.r, signature.s, message, INFLUENCER_FID),
    ).to.be.revertedWithCustomError(promoty, "RewardNotExpired")
  })
})
