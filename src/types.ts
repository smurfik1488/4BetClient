export interface SportEventDto {
  id: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogoUrl?: string | null;
  awayTeamLogoUrl?: string | null;
  eventDate: string;
  sportKey: string;
  homeWinOdds: number;
  drawOdds: number;
  awayWinOdds: number;
  lastUpdated: string;
  homeScore?: number | null;
  awayScore?: number | null;
  matchStatus: string;
  matchMinute?: number | null;
}

export interface ManageSportEventRequest {
  externalId?: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: string;
  sportKey: string;
  homeWinOdds: number;
  drawOdds: number;
  awayWinOdds: number;
  homeScore?: number | null;
  awayScore?: number | null;
  matchStatus?: string | null;
  matchMinute?: number | null;
}

export type BetSelection = 0 | 1 | 2;

export interface PlaceBetRequest {
  stake: number;
  legs: Array<{
    eventExternalId: string;
    selection: BetSelection;
    requestedOdds: number;
  }>;
}

export interface WalletBalanceDto {
  balance: number;
}

export interface WalletTopUpRequest {
  amount: number;
}

export interface UserProfileDto {
  email: string;
  firstName: string;
  lastName: string;
  avatarDataUrl?: string | null;
  isBdVerified: boolean;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateAvatarRequest {
  avatarDataUrl: string;
}

export interface BetLegDto {
  eventExternalId: string;
  homeTeam: string;
  awayTeam: string;
  selection: BetSelection;
  lockedOdds: number;
}

export interface BetDto {
  id: string;
  stake: number;
  combinedOdds: number;
  potentialPayout: number;
  status: 0 | 1 | 2 | 3;
  settledPayout?: number | null;
  settledAt?: string | null;
  createdAt: string;
  legs: BetLegDto[];
}

export interface BetAnalyticsPointDto {
  dayUtc: string;
  betsCount: number;
  wonCount: number;
  lostCount: number;
  stakeSum: number;
  payoutSum: number;
  net: number;
}

export interface BetAnalyticsDto {
  fromUtc: string;
  toUtc: string;
  totalBets: number;
  totalStake: number;
  totalPayout: number;
  net: number;
  winRatePercent: number;
  points: BetAnalyticsPointDto[];
}

export interface AdminVerificationRequestDto {
  id: string;
  userId: string;
  documentUrl: string;
  status: string;
  createdAt: string;
  userEmail?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
}

export interface AdminUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'User' | 'Moderator' | 'Admin' | string;
  isEmailVerified: boolean;
  isBdVerified: boolean;
}

export interface TeamImportResultDto {
  totalRows: number;
  uniqueRows: number;
  insertedRows: number;
  existingRows: number;
  invalidRows: number;
}
