/**
 * Tipos da base de dados.
 *
 * Escritos à mão a partir das migrações em `supabase/migrations/`. Podem ser
 * regenerados com `pnpm db:types` quando houver uma instância Supabase local
 * a correr; mantenha os dois em sincronia ao alterar o esquema.
 */

export type UserRole = "admin" | "distributor";

export type AuditAction =
  | "DELIVERED"
  | "DELIVERY_REVERSED"
  | "EMPLOYEE_CREATED"
  | "EMPLOYEE_UPDATED"
  | "EMPLOYEES_IMPORTED"
  | "COMPANY_CREATED"
  | "COMPANY_UPDATED"
  | "COMPANY_LIMIT_UPDATED"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id: string; email: string; full_name?: string; role?: UserRole };
        Update: { full_name?: string; role?: UserRole; is_active?: boolean };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          code: string;
          code_key: string;
          /** Adormecida desde a migração 0011. Nada a lê. */
          allocated_kits: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; code: string };
        Update: { name?: string; code?: string };
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          employee_number: string;
          employee_number_key: string;
          name: string;
          email: string | null;
          company_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          employee_number: string;
          name: string;
          email?: string | null;
          company_id: string;
        };
        Update: {
          employee_number?: string;
          name?: string;
          email?: string | null;
          company_id?: string;
        };
        Relationships: [];
      };
      deliveries: {
        Row: {
          id: string;
          employee_id: string;
          company_id: string;
          delivered_at: string;
          delivered_by: string;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
          idempotency_key: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      delivery_logs: {
        Row: {
          id: number;
          employee_id: string | null;
          company_id: string | null;
          delivery_id: string | null;
          action: AuditAction;
          performed_by: string | null;
          performed_at: string;
          notes: string | null;
          metadata: Json;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: {
      employee_list: {
        Row: {
          id: string;
          employee_number: string;
          name: string;
          email: string | null;
          company_id: string;
          company_name: string;
          company_code: string;
          delivery_id: string | null;
          delivered_at: string | null;
          delivered_by_name: string | null;
          kit_delivered: boolean;
          created_at: string;
        };
        Relationships: [];
      };
      delivery_history: {
        Row: {
          id: number;
          action: AuditAction;
          performed_at: string;
          notes: string | null;
          metadata: Json;
          employee_id: string | null;
          employee_number: string | null;
          employee_name: string | null;
          company_id: string | null;
          company_name: string | null;
          company_code: string | null;
          delivery_id: string | null;
          reversed_at: string | null;
          is_active_delivery: boolean | null;
          performed_by: string | null;
          performed_by_name: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      find_employee_for_delivery: { Args: { p_employee_number: string }; Returns: Json };
      search_employees_for_delivery: { Args: { p_query: string }; Returns: Json };
      deliver_kit: {
        Args: { p_employee_number: string; p_idempotency_key: string };
        Returns: Json;
      };
      reverse_delivery: {
        Args: { p_delivery_id: string; p_reason: string | null };
        Returns: Json;
      };
      import_employees: { Args: { p_rows: Json }; Returns: Json };
      create_employee_for_delivery: {
        Args: { p_employee_number: string; p_name: string; p_company_id: string };
        Returns: Json;
      };
      company_totals_list: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          code: string;
          delivered: number;
          employee_count: number;
        }[];
      };
      set_user_name: { Args: { p_user_id: string; p_name: string }; Returns: Json };
      set_user_role: { Args: { p_user_id: string; p_role: string }; Returns: Json };
      set_user_active: {
        Args: { p_user_id: string; p_active: boolean };
        Returns: Json;
      };
      save_employee: {
        Args: {
          p_id: string | null;
          p_employee_number: string;
          p_name: string;
          p_email: string | null;
          p_company_id: string;
        };
        Returns: Json;
      };
      save_company: {
        Args: {
          p_id: string | null;
          p_name: string;
          p_code: string | null;
        };
        Returns: Json;
      };
    };
  };
};
