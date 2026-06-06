export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type LeagueRole = 'head_admin' | 'admin' | 'officiator' | 'player'
export type MatchFormat = 'singles' | 'doubles' | 'mixed_doubles' | 'round_robin'
export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          first_name: string
          last_name: string
          nickname: string | null
          birthday: string | null
          phone: string | null
          display_name: string
          avatar_color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          first_name: string
          last_name: string
          nickname?: string | null
          birthday?: string | null
          phone?: string | null
          display_name: string
          avatar_color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          first_name?: string
          last_name?: string
          nickname?: string | null
          birthday?: string | null
          phone?: string | null
          display_name?: string
          avatar_color?: string
          updated_at?: string
        }
      }
      leagues: {
        Row: {
          id: string
          name: string
          description: string | null
          location: string | null
          invite_code: string
          banner_color: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          location?: string | null
          invite_code: string
          banner_color?: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          location?: string | null
          banner_color?: string
          updated_at?: string
        }
      }
      league_members: {
        Row: {
          id: string
          league_id: string
          user_id: string
          role: LeagueRole
          elo_rating: number
          wins: number
          losses: number
          joined_at: string
        }
        Insert: {
          id?: string
          league_id: string
          user_id: string
          role?: LeagueRole
          elo_rating?: number
          wins?: number
          losses?: number
          joined_at?: string
        }
        Update: {
          role?: LeagueRole
          elo_rating?: number
          wins?: number
          losses?: number
        }
      }
      matches: {
        Row: {
          id: string
          league_id: string
          format: MatchFormat
          status: MatchStatus
          officiator_id: string | null
          team1_score: number | null
          team2_score: number | null
          max_points: number
          scheduled_at: string | null
          completed_at: string | null
          created_by: string
          created_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          league_id: string
          format: MatchFormat
          status?: MatchStatus
          officiator_id?: string | null
          team1_score?: number | null
          team2_score?: number | null
          max_points?: number
          scheduled_at?: string | null
          completed_at?: string | null
          created_by: string
          created_at?: string
          notes?: string | null
        }
        Update: {
          status?: MatchStatus
          officiator_id?: string | null
          team1_score?: number | null
          team2_score?: number | null
          completed_at?: string | null
          notes?: string | null
        }
      }
      match_players: {
        Row: {
          id: string
          match_id: string
          user_id: string
          team: number
          elo_before: number
          elo_after: number | null
          created_at: string
        }
        Insert: {
          id?: string
          match_id: string
          user_id: string
          team: number
          elo_before: number
          elo_after?: number | null
          created_at?: string
        }
        Update: {
          elo_after?: number | null
        }
      }
      point_transactions: {
        Row: {
          id: string
          match_id: string
          user_id: string
          league_id: string
          points_before: number
          points_after: number
          delta: number
          created_at: string
        }
        Insert: {
          id?: string
          match_id: string
          user_id: string
          league_id: string
          points_before: number
          points_after: number
          delta: number
          created_at?: string
        }
        Update: never
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      league_role: LeagueRole
      match_format: MatchFormat
      match_status: MatchStatus
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type League = Database['public']['Tables']['leagues']['Row']
export type LeagueMember = Database['public']['Tables']['league_members']['Row']
export type Match = Database['public']['Tables']['matches']['Row']
export type MatchPlayer = Database['public']['Tables']['match_players']['Row']
export type PointTransaction = Database['public']['Tables']['point_transactions']['Row']

export interface LeagueMemberWithProfile extends LeagueMember {
  profiles: Profile
}

export interface MatchWithDetails extends Match {
  match_players: (MatchPlayer & { profiles: Profile })[]
  officiator?: Profile | null
}
