/**
 * Phase 0 TDD Verification Suite for NEXUS ROYALE Firestore Security Rules.
 * Verifies that all "Dirty Dozen" attack payloads fail with PERMISSION_DENIED
 * when executed against the Firestore Emulator with @firebase/rules-unit-testing.
 */
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

export async function runDirtyDozenSecurityTests(): Promise<void> {
  testEnv = await initializeTestEnvironment({
    projectId: 'gen-lang-client-0539248410',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  try {
    const now = serverTimestamp();

    // Seed legitimate verified users uid_a and uid_b
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'players', 'uid_a'), {
        uid: 'uid_a',
        playerId: 'p_aaaa1111bbbb2222',
        numericId: '111111111',
        email: 'alpha@example.com',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'publicProfiles', 'uid_a'), {
        uid: 'uid_a',
        playerId: 'p_aaaa1111bbbb2222',
        numericId: '111111111',
        username: 'ALPHA',
        usernameChanged: true,
        avatarId: 'avatar-recruit',
        bannerId: 'banner-standard',
        avatarCharacterId: 'char-01',
        gender: 'male',
        platform: 'pc',
        level: 5,
        xp: 40,
        rp: 520,
        tier: 'Silver',
        totalMatches: 4,
        wins: 1,
        eliminations: 12,
        deaths: 3,
        totalDamage: 1850,
        bestKillsInMatch: 5,
        rankedMatches: 2,
        rankedWins: 1,
        rankedKills: 6,
        rankedTop3: 2,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'publicProfiles', 'uid_b'), {
        uid: 'uid_b',
        playerId: 'p_cccc3333dddd4444',
        numericId: '222222222',
        username: 'BRAVO',
        usernameChanged: false,
        avatarId: 'avatar-recruit',
        bannerId: 'banner-standard',
        avatarCharacterId: 'char-01',
        gender: 'unset',
        platform: 'pc',
        level: 1,
        xp: 0,
        rp: 200,
        tier: 'Bronze',
        totalMatches: 0,
        wins: 0,
        eliminations: 0,
        deaths: 0,
        totalDamage: 0,
        bestKillsInMatch: 0,
        rankedMatches: 0,
        rankedWins: 0,
        rankedKills: 0,
        rankedTop3: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'playerIdIndex', '111111111'), {
        idKey: '111111111',
        uid: 'uid_a',
        playerId: 'p_aaaa1111bbbb2222',
        numericId: '111111111',
        createdAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'presence', 'uid_a'), {
        uid: 'uid_a',
        playerId: 'p_aaaa1111bbbb2222',
        status: 'online',
        platform: 'pc',
        lastSeenAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'presence', 'uid_b'), {
        uid: 'uid_b',
        playerId: 'p_cccc3333dddd4444',
        status: 'offline',
        platform: 'pc',
        lastSeenAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'presence', 'uid_c'), {
        uid: 'uid_c',
        playerId: 'p_eeee5555ffff6666',
        status: 'online',
        platform: 'pc',
        lastSeenAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'friendRequests', 'uid_a_uid_b'), {
        requestId: 'uid_a_uid_b',
        fromUid: 'uid_a',
        toUid: 'uid_b',
        fromPlayerId: 'p_aaaa1111bbbb2222',
        fromNumericId: '111111111',
        toPlayerId: 'p_cccc3333dddd4444',
        toNumericId: '222222222',
        status: 'pending',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const dbA = testEnv.authenticatedContext('uid_a', { email_verified: true, email: 'alpha@example.com' }).firestore();
    const dbB = testEnv.authenticatedContext('uid_b', { email_verified: true, email: 'bravo@example.com' }).firestore();
    const dbC = testEnv.authenticatedContext('uid_c', { email_verified: true, email: 'charlie@example.com' }).firestore();
    const dbUnverified = testEnv.authenticatedContext('uid_u', { email_verified: false, email: 'unverified@example.com' }).firestore();

    // 1. Cross-owner PII read
    await assertFails(getDoc(doc(dbB, 'players', 'uid_a')));

    // 2. Blanket user enumeration
    await assertFails(getDocs(collection(dbA, 'publicProfiles')));
    await assertFails(getDocs(collection(dbA, 'players')));
    await assertFails(getDocs(collection(dbA, 'playerIdIndex')));

    // 3. Unverified email write
    await assertFails(
      setDoc(doc(dbUnverified, 'presence', 'uid_u'), {
        uid: 'uid_u',
        playerId: 'p_unverified',
        status: 'online',
        platform: 'pc',
        lastSeenAt: now,
      }),
    );

    // 4. Shadow / Ghost Field Injection
    await assertFails(
      updateDoc(doc(dbB, 'publicProfiles', 'uid_b'), {
        isAdmin: true,
        updatedAt: now,
      }),
    );

    // 5. Immutable Player ID Hijack / Duplicate ID overwrite
    await assertFails(
      updateDoc(doc(dbA, 'publicProfiles', 'uid_a'), {
        playerId: 'p_hijacked',
        numericId: '999999999',
        updatedAt: now,
      }),
    );
    await assertFails(
      setDoc(doc(dbB, 'playerIdIndex', '111111111'), {
        idKey: '111111111',
        uid: 'uid_b',
        playerId: 'p_cccc3333dddd4444',
        numericId: '111111111',
        createdAt: now,
      }),
    );

    // 6. Unlimited owner rename succeeds, while /usernames reservation hijack fails
    await assertSucceeds(
      updateDoc(doc(dbA, 'publicProfiles', 'uid_a'), {
        username: 'ALPHA_II',
        updatedAt: now,
      }),
    );
    await assertFails(getDocs(collection(dbA, 'usernames')));
    await assertSucceeds(
      setDoc(doc(dbA, 'usernames', 'u_616c706861'), {
        usernameKey: 'u_616c706861',
        usernameLower: 'alpha',
        username: 'ALPHA',
        uid: 'uid_a',
        playerId: 'p_aaaa1111bbbb2222',
        updatedAt: now,
      }),
    );
    await assertFails(
      setDoc(doc(dbB, 'usernames', 'u_616c706861'), {
        usernameKey: 'u_616c706861',
        usernameLower: 'alpha',
        username: 'ALPHA',
        uid: 'uid_b',
        playerId: 'p_cccc3333dddd4444',
        updatedAt: now,
      }),
    );
    await assertFails(deleteDoc(doc(dbB, 'usernames', 'u_616c706861')));
    await assertSucceeds(
      updateDoc(doc(dbA, 'players', 'uid_a'), {
        cloudState: {
          selectedCharacterId: 'char-02',
          checkpoints: { lobbyMode: 'arena' },
        },
        updatedAt: now,
      }),
    );
    await assertFails(
      updateDoc(doc(dbA, 'players', 'uid_a'), {
        cloudState: {
          injectedField: true,
        },
        updatedAt: now,
      }),
    );

    // 7. Timestamp Forgery
    await assertFails(
      updateDoc(doc(dbB, 'publicProfiles', 'uid_b'), {
        level: 99,
        updatedAt: Timestamp.fromMillis(1000),
      }),
    );

    // 8. Self friend request & spoofed sender
    await assertFails(
      setDoc(doc(dbC, 'friendRequests', 'uid_a_uid_b'), {
        requestId: 'uid_a_uid_b',
        fromUid: 'uid_a',
        toUid: 'uid_b',
        fromPlayerId: 'p_aaaa1111bbbb2222',
        fromNumericId: '111111111',
        toPlayerId: 'p_cccc3333dddd4444',
        toNumericId: '222222222',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
    );

    // 9. Pre-accepted friend request
    await assertFails(
      setDoc(doc(dbB, 'friendRequests', 'uid_b_uid_a'), {
        requestId: 'uid_b_uid_a',
        fromUid: 'uid_b',
        toUid: 'uid_a',
        fromPlayerId: 'p_cccc3333dddd4444',
        fromNumericId: '222222222',
        toPlayerId: 'p_aaaa1111bbbb2222',
        toNumericId: '111111111',
        status: 'accepted',
        createdAt: now,
        updatedAt: now,
      }),
    );

    // 10. Sender self-accept
    await assertFails(
      updateDoc(doc(dbA, 'friendRequests', 'uid_a_uid_b'), {
        status: 'accepted',
        updatedAt: now,
      }),
    );

    // 11. Non-atomic orphan friendship creation
    await assertFails(
      setDoc(doc(dbB, 'friendships', 'uid_a_uid_b'), {
        friendshipId: 'uid_a_uid_b',
        users: ['uid_a', 'uid_b'],
        playerIds: ['p_aaaa1111bbbb2222', 'p_cccc3333dddd4444'],
        createdAt: now,
      }),
    );

    // 12. Oversized username & unauthorized presence read
    await assertFails(
      updateDoc(doc(dbB, 'publicProfiles', 'uid_b'), {
        username: 'X'.repeat(64),
        updatedAt: now,
      }),
    );
    await assertFails(getDoc(doc(dbC, 'presence', 'uid_a')));

    // Positive verification: atomic batch acceptance by recipient uid_b succeeds
    const acceptBatch = writeBatch(dbB);
    acceptBatch.update(doc(dbB, 'friendRequests', 'uid_a_uid_b'), {
      status: 'accepted',
      updatedAt: now,
    });
    acceptBatch.set(doc(dbB, 'friendships', 'uid_a_uid_b'), {
      friendshipId: 'uid_a_uid_b',
      users: ['uid_a', 'uid_b'],
      playerIds: ['p_aaaa1111bbbb2222', 'p_cccc3333dddd4444'],
      createdAt: now,
    });
    await assertSucceeds(acceptBatch.commit());

    // Terminal state lock: once accepted, request cannot be updated again
    await assertFails(
      updateDoc(doc(dbB, 'friendRequests', 'uid_a_uid_b'), {
        status: 'rejected',
        updatedAt: now,
      }),
    );

    // 13. Party creation requires atomic /partyMemberships/{uid} lock & valid maxSize (2 or 4)
    await assertFails(
      setDoc(doc(dbA, 'parties', 'party_alpha_1'), {
        partyId: 'party_alpha_1',
        leaderUid: 'uid_a',
        leaderPlayerId: 'p_aaaa1111bbbb2222',
        maxSize: 4,
        memberUids: ['uid_a'],
        members: {
          uid_a: {
            uid: 'uid_a',
            playerId: 'p_aaaa1111bbbb2222',
            numericId: '111111111',
            username: 'ALPHA',
            avatarId: 'avatar-recruit',
            level: 5,
            status: 'not-ready',
            joinedAt: 1000,
          },
        },
        createdAt: now,
        updatedAt: now,
      }),
    );

    const createPartyBatch = writeBatch(dbA);
    createPartyBatch.set(doc(dbA, 'parties', 'party_alpha_1'), {
      partyId: 'party_alpha_1',
      leaderUid: 'uid_a',
      leaderPlayerId: 'p_aaaa1111bbbb2222',
      maxSize: 4,
      memberUids: ['uid_a'],
      members: {
        uid_a: {
          uid: 'uid_a',
          playerId: 'p_aaaa1111bbbb2222',
          numericId: '111111111',
          username: 'ALPHA',
          avatarId: 'avatar-recruit',
          level: 5,
          status: 'not-ready',
          joinedAt: 1000,
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    createPartyBatch.set(doc(dbA, 'partyMemberships', 'uid_a'), {
      uid: 'uid_a',
      partyId: 'party_alpha_1',
      updatedAt: now,
    });
    await assertSucceeds(createPartyBatch.commit());

    // 14. Single-party lock: uid_a cannot create a second party while in party_alpha_1
    const secondPartyBatch = writeBatch(dbA);
    secondPartyBatch.set(doc(dbA, 'parties', 'party_alpha_2'), {
      partyId: 'party_alpha_2',
      leaderUid: 'uid_a',
      leaderPlayerId: 'p_aaaa1111bbbb2222',
      maxSize: 4,
      memberUids: ['uid_a'],
      members: {
        uid_a: {
          uid: 'uid_a',
          playerId: 'p_aaaa1111bbbb2222',
          numericId: '111111111',
          username: 'ALPHA',
          avatarId: 'avatar-recruit',
          level: 5,
          status: 'not-ready',
          joinedAt: 2000,
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    await assertFails(secondPartyBatch.commit());

    // 15. Party invite blocked if target is offline or not a friend
    await assertFails(
      setDoc(doc(dbA, 'partyInvites', 'party_alpha_1_uid_b'), {
        inviteId: 'party_alpha_1_uid_b',
        partyId: 'party_alpha_1',
        fromUid: 'uid_a',
        fromPlayerId: 'p_aaaa1111bbbb2222',
        fromNumericId: '111111111',
        fromName: 'ALPHA',
        fromTier: 'Silver',
        fromLevel: 5,
        fromAvatarId: 'avatar-recruit',
        toUid: 'uid_b',
        toPlayerId: 'p_cccc3333dddd4444',
        maxSize: 4,
        memberCount: 1,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
    );

    await assertFails(
      setDoc(doc(dbA, 'partyInvites', 'party_alpha_1_uid_c'), {
        inviteId: 'party_alpha_1_uid_c',
        partyId: 'party_alpha_1',
        fromUid: 'uid_a',
        fromPlayerId: 'p_aaaa1111bbbb2222',
        fromNumericId: '111111111',
        fromName: 'ALPHA',
        fromTier: 'Silver',
        fromLevel: 5,
        fromAvatarId: 'avatar-recruit',
        toUid: 'uid_c',
        toPlayerId: 'p_eeee5555ffff6666',
        maxSize: 4,
        memberCount: 1,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
    );

    // 16. Bring uid_b online, then leader uid_a invite succeeds
    await assertSucceeds(
      updateDoc(doc(dbB, 'presence', 'uid_b'), {
        status: 'online',
        platform: 'pc',
        lastSeenAt: now,
      }),
    );
    await assertSucceeds(
      setDoc(doc(dbA, 'partyInvites', 'party_alpha_1_uid_b'), {
        inviteId: 'party_alpha_1_uid_b',
        partyId: 'party_alpha_1',
        fromUid: 'uid_a',
        fromPlayerId: 'p_aaaa1111bbbb2222',
        fromNumericId: '111111111',
        fromName: 'ALPHA',
        fromTier: 'Silver',
        fromLevel: 5,
        fromAvatarId: 'avatar-recruit',
        toUid: 'uid_b',
        toPlayerId: 'p_cccc3333dddd4444',
        maxSize: 4,
        memberCount: 1,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
    );

    // 17. Uninvited uid_c cannot force-join party_alpha_1
    const sneakJoin = writeBatch(dbC);
    sneakJoin.update(doc(dbC, 'parties', 'party_alpha_1'), {
      memberUids: ['uid_a', 'uid_c'],
      'members.uid_c': {
        uid: 'uid_c',
        playerId: 'p_eeee5555ffff6666',
        numericId: '333333333',
        username: 'CHARLIE',
        avatarId: 'avatar-recruit',
        level: 1,
        status: 'ready',
        joinedAt: 2000,
      },
      updatedAt: now,
    });
    sneakJoin.set(doc(dbC, 'partyMemberships', 'uid_c'), {
      uid: 'uid_c',
      partyId: 'party_alpha_1',
      updatedAt: now,
    });
    await assertFails(sneakJoin.commit());

    // 18. Invited friend uid_b atomically accepts invite and joins party
    const acceptInviteBatch = writeBatch(dbB);
    acceptInviteBatch.update(doc(dbB, 'partyInvites', 'party_alpha_1_uid_b'), {
      status: 'accepted',
      updatedAt: now,
    });
    acceptInviteBatch.update(doc(dbB, 'parties', 'party_alpha_1'), {
      memberUids: ['uid_a', 'uid_b'],
      'members.uid_b': {
        uid: 'uid_b',
        playerId: 'p_cccc3333dddd4444',
        numericId: '222222222',
        username: 'BRAVO',
        avatarId: 'avatar-recruit',
        level: 1,
        status: 'not-ready',
        joinedAt: 3000,
      },
      updatedAt: now,
    });
    acceptInviteBatch.set(doc(dbB, 'partyMemberships', 'uid_b'), {
      uid: 'uid_b',
      partyId: 'party_alpha_1',
      updatedAt: now,
    });
    await assertSucceeds(acceptInviteBatch.commit());

    // 19. Self READY toggle allowed for uid_b, blocked if uid_b tries to tamper with uid_a
    await assertSucceeds(
      updateDoc(doc(dbB, 'parties', 'party_alpha_1'), {
        'members.uid_b.status': 'ready',
        updatedAt: now,
      }),
    );
    await assertFails(
      updateDoc(doc(dbB, 'parties', 'party_alpha_1'), {
        'members.uid_a.status': 'not-ready',
        updatedAt: now,
      }),
    );

    // 20. Non-leader uid_b cannot kick uid_a or transfer leadership
    await assertFails(
      updateDoc(doc(dbB, 'parties', 'party_alpha_1'), {
        leaderUid: 'uid_b',
        leaderPlayerId: 'p_cccc3333dddd4444',
        updatedAt: now,
      }),
    );

    // 21. Leader uid_a leaves -> automatically transfers leadership to uid_b
    const leaderLeaveBatch = writeBatch(dbA);
    leaderLeaveBatch.update(doc(dbA, 'parties', 'party_alpha_1'), {
      leaderUid: 'uid_b',
      leaderPlayerId: 'p_cccc3333dddd4444',
      memberUids: ['uid_b'],
      'members.uid_a': deleteField(),
      updatedAt: now,
    });
    leaderLeaveBatch.delete(doc(dbA, 'partyMemberships', 'uid_a'));
    await assertSucceeds(leaderLeaveBatch.commit());

    // 22. Last member uid_b leaves -> deletes party + membership cleanly
    const lastLeaveBatch = writeBatch(dbB);
    lastLeaveBatch.delete(doc(dbB, 'parties', 'party_alpha_1'));
    lastLeaveBatch.delete(doc(dbB, 'partyMemberships', 'uid_b'));
    await assertSucceeds(lastLeaveBatch.commit());

    // Clean unused deleteDoc import reference check
    void deleteDoc;
  } finally {
    await testEnv.cleanup();
  }
}

