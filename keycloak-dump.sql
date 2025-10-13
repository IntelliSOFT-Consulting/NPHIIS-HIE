--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17
-- Dumped by pg_dump version 14.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_event_entity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_event_entity (
    id character varying(36) NOT NULL,
    admin_event_time bigint,
    realm_id character varying(255),
    operation_type character varying(255),
    auth_realm_id character varying(255),
    auth_client_id character varying(255),
    auth_user_id character varying(255),
    ip_address character varying(255),
    resource_path character varying(2550),
    representation text,
    error character varying(255),
    resource_type character varying(64)
);


ALTER TABLE public.admin_event_entity OWNER TO postgres;

--
-- Name: associated_policy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.associated_policy (
    policy_id character varying(36) NOT NULL,
    associated_policy_id character varying(36) NOT NULL
);


ALTER TABLE public.associated_policy OWNER TO postgres;

--
-- Name: authentication_execution; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.authentication_execution (
    id character varying(36) NOT NULL,
    alias character varying(255),
    authenticator character varying(36),
    realm_id character varying(36),
    flow_id character varying(36),
    requirement integer,
    priority integer,
    authenticator_flow boolean DEFAULT false NOT NULL,
    auth_flow_id character varying(36),
    auth_config character varying(36)
);


ALTER TABLE public.authentication_execution OWNER TO postgres;

--
-- Name: authentication_flow; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.authentication_flow (
    id character varying(36) NOT NULL,
    alias character varying(255),
    description character varying(255),
    realm_id character varying(36),
    provider_id character varying(36) DEFAULT 'basic-flow'::character varying NOT NULL,
    top_level boolean DEFAULT false NOT NULL,
    built_in boolean DEFAULT false NOT NULL
);


ALTER TABLE public.authentication_flow OWNER TO postgres;

--
-- Name: authenticator_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.authenticator_config (
    id character varying(36) NOT NULL,
    alias character varying(255),
    realm_id character varying(36)
);


ALTER TABLE public.authenticator_config OWNER TO postgres;

--
-- Name: authenticator_config_entry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.authenticator_config_entry (
    authenticator_id character varying(36) NOT NULL,
    value text,
    name character varying(255) NOT NULL
);


ALTER TABLE public.authenticator_config_entry OWNER TO postgres;

--
-- Name: broker_link; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.broker_link (
    identity_provider character varying(255) NOT NULL,
    storage_provider_id character varying(255),
    realm_id character varying(36) NOT NULL,
    broker_user_id character varying(255),
    broker_username character varying(255),
    token text,
    user_id character varying(255) NOT NULL
);


ALTER TABLE public.broker_link OWNER TO postgres;

--
-- Name: client; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client (
    id character varying(36) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    full_scope_allowed boolean DEFAULT false NOT NULL,
    client_id character varying(255),
    not_before integer,
    public_client boolean DEFAULT false NOT NULL,
    secret character varying(255),
    base_url character varying(255),
    bearer_only boolean DEFAULT false NOT NULL,
    management_url character varying(255),
    surrogate_auth_required boolean DEFAULT false NOT NULL,
    realm_id character varying(36),
    protocol character varying(255),
    node_rereg_timeout integer DEFAULT 0,
    frontchannel_logout boolean DEFAULT false NOT NULL,
    consent_required boolean DEFAULT false NOT NULL,
    name character varying(255),
    service_accounts_enabled boolean DEFAULT false NOT NULL,
    client_authenticator_type character varying(255),
    root_url character varying(255),
    description character varying(255),
    registration_token character varying(255),
    standard_flow_enabled boolean DEFAULT true NOT NULL,
    implicit_flow_enabled boolean DEFAULT false NOT NULL,
    direct_access_grants_enabled boolean DEFAULT false NOT NULL,
    always_display_in_console boolean DEFAULT false NOT NULL
);


ALTER TABLE public.client OWNER TO postgres;

--
-- Name: client_attributes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_attributes (
    client_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    value text
);


ALTER TABLE public.client_attributes OWNER TO postgres;

--
-- Name: client_auth_flow_bindings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_auth_flow_bindings (
    client_id character varying(36) NOT NULL,
    flow_id character varying(36),
    binding_name character varying(255) NOT NULL
);


ALTER TABLE public.client_auth_flow_bindings OWNER TO postgres;

--
-- Name: client_initial_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_initial_access (
    id character varying(36) NOT NULL,
    realm_id character varying(36) NOT NULL,
    "timestamp" integer,
    expiration integer,
    count integer,
    remaining_count integer
);


ALTER TABLE public.client_initial_access OWNER TO postgres;

--
-- Name: client_node_registrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_node_registrations (
    client_id character varying(36) NOT NULL,
    value integer,
    name character varying(255) NOT NULL
);


ALTER TABLE public.client_node_registrations OWNER TO postgres;

--
-- Name: client_scope; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_scope (
    id character varying(36) NOT NULL,
    name character varying(255),
    realm_id character varying(36),
    description character varying(255),
    protocol character varying(255)
);


ALTER TABLE public.client_scope OWNER TO postgres;

--
-- Name: client_scope_attributes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_scope_attributes (
    scope_id character varying(36) NOT NULL,
    value character varying(2048),
    name character varying(255) NOT NULL
);


ALTER TABLE public.client_scope_attributes OWNER TO postgres;

--
-- Name: client_scope_client; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_scope_client (
    client_id character varying(255) NOT NULL,
    scope_id character varying(255) NOT NULL,
    default_scope boolean DEFAULT false NOT NULL
);


ALTER TABLE public.client_scope_client OWNER TO postgres;

--
-- Name: client_scope_role_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_scope_role_mapping (
    scope_id character varying(36) NOT NULL,
    role_id character varying(36) NOT NULL
);


ALTER TABLE public.client_scope_role_mapping OWNER TO postgres;

--
-- Name: component; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.component (
    id character varying(36) NOT NULL,
    name character varying(255),
    parent_id character varying(36),
    provider_id character varying(36),
    provider_type character varying(255),
    realm_id character varying(36),
    sub_type character varying(255)
);


ALTER TABLE public.component OWNER TO postgres;

--
-- Name: component_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.component_config (
    id character varying(36) NOT NULL,
    component_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    value text
);


ALTER TABLE public.component_config OWNER TO postgres;

--
-- Name: composite_role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.composite_role (
    composite character varying(36) NOT NULL,
    child_role character varying(36) NOT NULL
);


ALTER TABLE public.composite_role OWNER TO postgres;

--
-- Name: credential; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credential (
    id character varying(36) NOT NULL,
    salt bytea,
    type character varying(255),
    user_id character varying(36),
    created_date bigint,
    user_label character varying(255),
    secret_data text,
    credential_data text,
    priority integer
);


ALTER TABLE public.credential OWNER TO postgres;

--
-- Name: databasechangelog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.databasechangelog (
    id character varying(255) NOT NULL,
    author character varying(255) NOT NULL,
    filename character varying(255) NOT NULL,
    dateexecuted timestamp without time zone NOT NULL,
    orderexecuted integer NOT NULL,
    exectype character varying(10) NOT NULL,
    md5sum character varying(35),
    description character varying(255),
    comments character varying(255),
    tag character varying(255),
    liquibase character varying(20),
    contexts character varying(255),
    labels character varying(255),
    deployment_id character varying(10)
);


ALTER TABLE public.databasechangelog OWNER TO postgres;

--
-- Name: databasechangeloglock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.databasechangeloglock (
    id integer NOT NULL,
    locked boolean NOT NULL,
    lockgranted timestamp without time zone,
    lockedby character varying(255)
);


ALTER TABLE public.databasechangeloglock OWNER TO postgres;

--
-- Name: default_client_scope; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.default_client_scope (
    realm_id character varying(36) NOT NULL,
    scope_id character varying(36) NOT NULL,
    default_scope boolean DEFAULT false NOT NULL
);


ALTER TABLE public.default_client_scope OWNER TO postgres;

--
-- Name: event_entity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_entity (
    id character varying(36) NOT NULL,
    client_id character varying(255),
    details_json character varying(2550),
    error character varying(255),
    ip_address character varying(255),
    realm_id character varying(255),
    session_id character varying(255),
    event_time bigint,
    type character varying(255),
    user_id character varying(255),
    details_json_long_value text
);


ALTER TABLE public.event_entity OWNER TO postgres;

--
-- Name: fed_user_attribute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_attribute (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    storage_provider_id character varying(36),
    value character varying(2024),
    long_value_hash bytea,
    long_value_hash_lower_case bytea,
    long_value text
);


ALTER TABLE public.fed_user_attribute OWNER TO postgres;

--
-- Name: fed_user_consent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_consent (
    id character varying(36) NOT NULL,
    client_id character varying(255),
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    storage_provider_id character varying(36),
    created_date bigint,
    last_updated_date bigint,
    client_storage_provider character varying(36),
    external_client_id character varying(255)
);


ALTER TABLE public.fed_user_consent OWNER TO postgres;

--
-- Name: fed_user_consent_cl_scope; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_consent_cl_scope (
    user_consent_id character varying(36) NOT NULL,
    scope_id character varying(36) NOT NULL
);


ALTER TABLE public.fed_user_consent_cl_scope OWNER TO postgres;

--
-- Name: fed_user_credential; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_credential (
    id character varying(36) NOT NULL,
    salt bytea,
    type character varying(255),
    created_date bigint,
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    storage_provider_id character varying(36),
    user_label character varying(255),
    secret_data text,
    credential_data text,
    priority integer
);


ALTER TABLE public.fed_user_credential OWNER TO postgres;

--
-- Name: fed_user_group_membership; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_group_membership (
    group_id character varying(36) NOT NULL,
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    storage_provider_id character varying(36)
);


ALTER TABLE public.fed_user_group_membership OWNER TO postgres;

--
-- Name: fed_user_required_action; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_required_action (
    required_action character varying(255) DEFAULT ' '::character varying NOT NULL,
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    storage_provider_id character varying(36)
);


ALTER TABLE public.fed_user_required_action OWNER TO postgres;

--
-- Name: fed_user_role_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fed_user_role_mapping (
    role_id character varying(36) NOT NULL,
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    storage_provider_id character varying(36)
);


ALTER TABLE public.fed_user_role_mapping OWNER TO postgres;

--
-- Name: federated_identity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.federated_identity (
    identity_provider character varying(255) NOT NULL,
    realm_id character varying(36),
    federated_user_id character varying(255),
    federated_username character varying(255),
    token text,
    user_id character varying(36) NOT NULL
);


ALTER TABLE public.federated_identity OWNER TO postgres;

--
-- Name: federated_user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.federated_user (
    id character varying(255) NOT NULL,
    storage_provider_id character varying(255),
    realm_id character varying(36) NOT NULL
);


ALTER TABLE public.federated_user OWNER TO postgres;

--
-- Name: group_attribute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_attribute (
    id character varying(36) DEFAULT 'sybase-needs-something-here'::character varying NOT NULL,
    name character varying(255) NOT NULL,
    value character varying(255),
    group_id character varying(36) NOT NULL
);


ALTER TABLE public.group_attribute OWNER TO postgres;

--
-- Name: group_role_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_role_mapping (
    role_id character varying(36) NOT NULL,
    group_id character varying(36) NOT NULL
);


ALTER TABLE public.group_role_mapping OWNER TO postgres;

--
-- Name: identity_provider; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.identity_provider (
    internal_id character varying(36) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    provider_alias character varying(255),
    provider_id character varying(255),
    store_token boolean DEFAULT false NOT NULL,
    authenticate_by_default boolean DEFAULT false NOT NULL,
    realm_id character varying(36),
    add_token_role boolean DEFAULT true NOT NULL,
    trust_email boolean DEFAULT false NOT NULL,
    first_broker_login_flow_id character varying(36),
    post_broker_login_flow_id character varying(36),
    provider_display_name character varying(255),
    link_only boolean DEFAULT false NOT NULL,
    organization_id character varying(255),
    hide_on_login boolean DEFAULT false
);


ALTER TABLE public.identity_provider OWNER TO postgres;

--
-- Name: identity_provider_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.identity_provider_config (
    identity_provider_id character varying(36) NOT NULL,
    value text,
    name character varying(255) NOT NULL
);


ALTER TABLE public.identity_provider_config OWNER TO postgres;

--
-- Name: identity_provider_mapper; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.identity_provider_mapper (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    idp_alias character varying(255) NOT NULL,
    idp_mapper_name character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL
);


ALTER TABLE public.identity_provider_mapper OWNER TO postgres;

--
-- Name: idp_mapper_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.idp_mapper_config (
    idp_mapper_id character varying(36) NOT NULL,
    value text,
    name character varying(255) NOT NULL
);


ALTER TABLE public.idp_mapper_config OWNER TO postgres;

--
-- Name: keycloak_group; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.keycloak_group (
    id character varying(36) NOT NULL,
    name character varying(255),
    parent_group character varying(36) NOT NULL,
    realm_id character varying(36),
    type integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.keycloak_group OWNER TO postgres;

--
-- Name: keycloak_role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.keycloak_role (
    id character varying(36) NOT NULL,
    client_realm_constraint character varying(255),
    client_role boolean DEFAULT false NOT NULL,
    description character varying(255),
    name character varying(255),
    realm_id character varying(255),
    client character varying(36),
    realm character varying(36)
);


ALTER TABLE public.keycloak_role OWNER TO postgres;

--
-- Name: migration_model; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migration_model (
    id character varying(36) NOT NULL,
    version character varying(36),
    update_time bigint DEFAULT 0 NOT NULL
);


ALTER TABLE public.migration_model OWNER TO postgres;

--
-- Name: offline_client_session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_client_session (
    user_session_id character varying(36) NOT NULL,
    client_id character varying(255) NOT NULL,
    offline_flag character varying(4) NOT NULL,
    "timestamp" integer,
    data text,
    client_storage_provider character varying(36) DEFAULT 'local'::character varying NOT NULL,
    external_client_id character varying(255) DEFAULT 'local'::character varying NOT NULL,
    version integer DEFAULT 0
);


ALTER TABLE public.offline_client_session OWNER TO postgres;

--
-- Name: offline_user_session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_user_session (
    user_session_id character varying(36) NOT NULL,
    user_id character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    created_on integer NOT NULL,
    offline_flag character varying(4) NOT NULL,
    data text,
    last_session_refresh integer DEFAULT 0 NOT NULL,
    broker_session_id character varying(1024),
    version integer DEFAULT 0
);


ALTER TABLE public.offline_user_session OWNER TO postgres;

--
-- Name: org; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.org (
    id character varying(255) NOT NULL,
    enabled boolean NOT NULL,
    realm_id character varying(255) NOT NULL,
    group_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(4000),
    alias character varying(255) NOT NULL,
    redirect_url character varying(2048)
);


ALTER TABLE public.org OWNER TO postgres;

--
-- Name: org_domain; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.org_domain (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    verified boolean NOT NULL,
    org_id character varying(255) NOT NULL
);


ALTER TABLE public.org_domain OWNER TO postgres;

--
-- Name: policy_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.policy_config (
    policy_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    value text
);


ALTER TABLE public.policy_config OWNER TO postgres;

--
-- Name: protocol_mapper; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.protocol_mapper (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    protocol character varying(255) NOT NULL,
    protocol_mapper_name character varying(255) NOT NULL,
    client_id character varying(36),
    client_scope_id character varying(36)
);


ALTER TABLE public.protocol_mapper OWNER TO postgres;

--
-- Name: protocol_mapper_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.protocol_mapper_config (
    protocol_mapper_id character varying(36) NOT NULL,
    value text,
    name character varying(255) NOT NULL
);


ALTER TABLE public.protocol_mapper_config OWNER TO postgres;

--
-- Name: realm; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm (
    id character varying(36) NOT NULL,
    access_code_lifespan integer,
    user_action_lifespan integer,
    access_token_lifespan integer,
    account_theme character varying(255),
    admin_theme character varying(255),
    email_theme character varying(255),
    enabled boolean DEFAULT false NOT NULL,
    events_enabled boolean DEFAULT false NOT NULL,
    events_expiration bigint,
    login_theme character varying(255),
    name character varying(255),
    not_before integer,
    password_policy character varying(2550),
    registration_allowed boolean DEFAULT false NOT NULL,
    remember_me boolean DEFAULT false NOT NULL,
    reset_password_allowed boolean DEFAULT false NOT NULL,
    social boolean DEFAULT false NOT NULL,
    ssl_required character varying(255),
    sso_idle_timeout integer,
    sso_max_lifespan integer,
    update_profile_on_soc_login boolean DEFAULT false NOT NULL,
    verify_email boolean DEFAULT false NOT NULL,
    master_admin_client character varying(36),
    login_lifespan integer,
    internationalization_enabled boolean DEFAULT false NOT NULL,
    default_locale character varying(255),
    reg_email_as_username boolean DEFAULT false NOT NULL,
    admin_events_enabled boolean DEFAULT false NOT NULL,
    admin_events_details_enabled boolean DEFAULT false NOT NULL,
    edit_username_allowed boolean DEFAULT false NOT NULL,
    otp_policy_counter integer DEFAULT 0,
    otp_policy_window integer DEFAULT 1,
    otp_policy_period integer DEFAULT 30,
    otp_policy_digits integer DEFAULT 6,
    otp_policy_alg character varying(36) DEFAULT 'HmacSHA1'::character varying,
    otp_policy_type character varying(36) DEFAULT 'totp'::character varying,
    browser_flow character varying(36),
    registration_flow character varying(36),
    direct_grant_flow character varying(36),
    reset_credentials_flow character varying(36),
    client_auth_flow character varying(36),
    offline_session_idle_timeout integer DEFAULT 0,
    revoke_refresh_token boolean DEFAULT false NOT NULL,
    access_token_life_implicit integer DEFAULT 0,
    login_with_email_allowed boolean DEFAULT true NOT NULL,
    duplicate_emails_allowed boolean DEFAULT false NOT NULL,
    docker_auth_flow character varying(36),
    refresh_token_max_reuse integer DEFAULT 0,
    allow_user_managed_access boolean DEFAULT false NOT NULL,
    sso_max_lifespan_remember_me integer DEFAULT 0 NOT NULL,
    sso_idle_timeout_remember_me integer DEFAULT 0 NOT NULL,
    default_role character varying(255)
);


ALTER TABLE public.realm OWNER TO postgres;

--
-- Name: realm_attribute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_attribute (
    name character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL,
    value text
);


ALTER TABLE public.realm_attribute OWNER TO postgres;

--
-- Name: realm_default_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_default_groups (
    realm_id character varying(36) NOT NULL,
    group_id character varying(36) NOT NULL
);


ALTER TABLE public.realm_default_groups OWNER TO postgres;

--
-- Name: realm_enabled_event_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_enabled_event_types (
    realm_id character varying(36) NOT NULL,
    value character varying(255) NOT NULL
);


ALTER TABLE public.realm_enabled_event_types OWNER TO postgres;

--
-- Name: realm_events_listeners; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_events_listeners (
    realm_id character varying(36) NOT NULL,
    value character varying(255) NOT NULL
);


ALTER TABLE public.realm_events_listeners OWNER TO postgres;

--
-- Name: realm_localizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_localizations (
    realm_id character varying(255) NOT NULL,
    locale character varying(255) NOT NULL,
    texts text NOT NULL
);


ALTER TABLE public.realm_localizations OWNER TO postgres;

--
-- Name: realm_required_credential; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_required_credential (
    type character varying(255) NOT NULL,
    form_label character varying(255),
    input boolean DEFAULT false NOT NULL,
    secret boolean DEFAULT false NOT NULL,
    realm_id character varying(36) NOT NULL
);


ALTER TABLE public.realm_required_credential OWNER TO postgres;

--
-- Name: realm_smtp_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_smtp_config (
    realm_id character varying(36) NOT NULL,
    value character varying(255),
    name character varying(255) NOT NULL
);


ALTER TABLE public.realm_smtp_config OWNER TO postgres;

--
-- Name: realm_supported_locales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.realm_supported_locales (
    realm_id character varying(36) NOT NULL,
    value character varying(255) NOT NULL
);


ALTER TABLE public.realm_supported_locales OWNER TO postgres;

--
-- Name: redirect_uris; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.redirect_uris (
    client_id character varying(36) NOT NULL,
    value character varying(255) NOT NULL
);


ALTER TABLE public.redirect_uris OWNER TO postgres;

--
-- Name: required_action_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.required_action_config (
    required_action_id character varying(36) NOT NULL,
    value text,
    name character varying(255) NOT NULL
);


ALTER TABLE public.required_action_config OWNER TO postgres;

--
-- Name: required_action_provider; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.required_action_provider (
    id character varying(36) NOT NULL,
    alias character varying(255),
    name character varying(255),
    realm_id character varying(36),
    enabled boolean DEFAULT false NOT NULL,
    default_action boolean DEFAULT false NOT NULL,
    provider_id character varying(255),
    priority integer
);


ALTER TABLE public.required_action_provider OWNER TO postgres;

--
-- Name: resource_attribute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_attribute (
    id character varying(36) DEFAULT 'sybase-needs-something-here'::character varying NOT NULL,
    name character varying(255) NOT NULL,
    value character varying(255),
    resource_id character varying(36) NOT NULL
);


ALTER TABLE public.resource_attribute OWNER TO postgres;

--
-- Name: resource_policy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_policy (
    resource_id character varying(36) NOT NULL,
    policy_id character varying(36) NOT NULL
);


ALTER TABLE public.resource_policy OWNER TO postgres;

--
-- Name: resource_scope; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_scope (
    resource_id character varying(36) NOT NULL,
    scope_id character varying(36) NOT NULL
);


ALTER TABLE public.resource_scope OWNER TO postgres;

--
-- Name: resource_server; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_server (
    id character varying(36) NOT NULL,
    allow_rs_remote_mgmt boolean DEFAULT false NOT NULL,
    policy_enforce_mode smallint NOT NULL,
    decision_strategy smallint DEFAULT 1 NOT NULL
);


ALTER TABLE public.resource_server OWNER TO postgres;

--
-- Name: resource_server_perm_ticket; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_server_perm_ticket (
    id character varying(36) NOT NULL,
    owner character varying(255) NOT NULL,
    requester character varying(255) NOT NULL,
    created_timestamp bigint NOT NULL,
    granted_timestamp bigint,
    resource_id character varying(36) NOT NULL,
    scope_id character varying(36),
    resource_server_id character varying(36) NOT NULL,
    policy_id character varying(36)
);


ALTER TABLE public.resource_server_perm_ticket OWNER TO postgres;

--
-- Name: resource_server_policy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_server_policy (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(255),
    type character varying(255) NOT NULL,
    decision_strategy smallint,
    logic smallint,
    resource_server_id character varying(36) NOT NULL,
    owner character varying(255)
);


ALTER TABLE public.resource_server_policy OWNER TO postgres;

--
-- Name: resource_server_resource; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_server_resource (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(255),
    icon_uri character varying(255),
    owner character varying(255) NOT NULL,
    resource_server_id character varying(36) NOT NULL,
    owner_managed_access boolean DEFAULT false NOT NULL,
    display_name character varying(255)
);


ALTER TABLE public.resource_server_resource OWNER TO postgres;

--
-- Name: resource_server_scope; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_server_scope (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    icon_uri character varying(255),
    resource_server_id character varying(36) NOT NULL,
    display_name character varying(255)
);


ALTER TABLE public.resource_server_scope OWNER TO postgres;

--
-- Name: resource_uris; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_uris (
    resource_id character varying(36) NOT NULL,
    value character varying(255) NOT NULL
);


ALTER TABLE public.resource_uris OWNER TO postgres;

--
-- Name: revoked_token; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.revoked_token (
    id character varying(255) NOT NULL,
    expire bigint NOT NULL
);


ALTER TABLE public.revoked_token OWNER TO postgres;

--
-- Name: role_attribute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_attribute (
    id character varying(36) NOT NULL,
    role_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    value character varying(255)
);


ALTER TABLE public.role_attribute OWNER TO postgres;

--
-- Name: scope_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scope_mapping (
    client_id character varying(36) NOT NULL,
    role_id character varying(36) NOT NULL
);


ALTER TABLE public.scope_mapping OWNER TO postgres;

--
-- Name: scope_policy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scope_policy (
    scope_id character varying(36) NOT NULL,
    policy_id character varying(36) NOT NULL
);


ALTER TABLE public.scope_policy OWNER TO postgres;

--
-- Name: user_attribute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_attribute (
    name character varying(255) NOT NULL,
    value character varying(255),
    user_id character varying(36) NOT NULL,
    id character varying(36) DEFAULT 'sybase-needs-something-here'::character varying NOT NULL,
    long_value_hash bytea,
    long_value_hash_lower_case bytea,
    long_value text
);


ALTER TABLE public.user_attribute OWNER TO postgres;

--
-- Name: user_consent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_consent (
    id character varying(36) NOT NULL,
    client_id character varying(255),
    user_id character varying(36) NOT NULL,
    created_date bigint,
    last_updated_date bigint,
    client_storage_provider character varying(36),
    external_client_id character varying(255)
);


ALTER TABLE public.user_consent OWNER TO postgres;

--
-- Name: user_consent_client_scope; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_consent_client_scope (
    user_consent_id character varying(36) NOT NULL,
    scope_id character varying(36) NOT NULL
);


ALTER TABLE public.user_consent_client_scope OWNER TO postgres;

--
-- Name: user_entity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_entity (
    id character varying(36) NOT NULL,
    email character varying(255),
    email_constraint character varying(255),
    email_verified boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    federation_link character varying(255),
    first_name character varying(255),
    last_name character varying(255),
    realm_id character varying(255),
    username character varying(255),
    created_timestamp bigint,
    service_account_client_link character varying(255),
    not_before integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.user_entity OWNER TO postgres;

--
-- Name: user_federation_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_federation_config (
    user_federation_provider_id character varying(36) NOT NULL,
    value character varying(255),
    name character varying(255) NOT NULL
);


ALTER TABLE public.user_federation_config OWNER TO postgres;

--
-- Name: user_federation_mapper; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_federation_mapper (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    federation_provider_id character varying(36) NOT NULL,
    federation_mapper_type character varying(255) NOT NULL,
    realm_id character varying(36) NOT NULL
);


ALTER TABLE public.user_federation_mapper OWNER TO postgres;

--
-- Name: user_federation_mapper_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_federation_mapper_config (
    user_federation_mapper_id character varying(36) NOT NULL,
    value character varying(255),
    name character varying(255) NOT NULL
);


ALTER TABLE public.user_federation_mapper_config OWNER TO postgres;

--
-- Name: user_federation_provider; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_federation_provider (
    id character varying(36) NOT NULL,
    changed_sync_period integer,
    display_name character varying(255),
    full_sync_period integer,
    last_sync integer,
    priority integer,
    provider_name character varying(255),
    realm_id character varying(36)
);


ALTER TABLE public.user_federation_provider OWNER TO postgres;

--
-- Name: user_group_membership; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_group_membership (
    group_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    membership_type character varying(255) NOT NULL
);


ALTER TABLE public.user_group_membership OWNER TO postgres;

--
-- Name: user_required_action; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_required_action (
    user_id character varying(36) NOT NULL,
    required_action character varying(255) DEFAULT ' '::character varying NOT NULL
);


ALTER TABLE public.user_required_action OWNER TO postgres;

--
-- Name: user_role_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_role_mapping (
    role_id character varying(255) NOT NULL,
    user_id character varying(36) NOT NULL
);


ALTER TABLE public.user_role_mapping OWNER TO postgres;

--
-- Name: username_login_failure; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.username_login_failure (
    realm_id character varying(36) NOT NULL,
    username character varying(255) NOT NULL,
    failed_login_not_before integer,
    last_failure bigint,
    last_ip_failure character varying(255),
    num_failures integer
);


ALTER TABLE public.username_login_failure OWNER TO postgres;

--
-- Name: web_origins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.web_origins (
    client_id character varying(36) NOT NULL,
    value character varying(255) NOT NULL
);


ALTER TABLE public.web_origins OWNER TO postgres;

--
-- Data for Name: admin_event_entity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_event_entity (id, admin_event_time, realm_id, operation_type, auth_realm_id, auth_client_id, auth_user_id, ip_address, resource_path, representation, error, resource_type) FROM stdin;
\.


--
-- Data for Name: associated_policy; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.associated_policy (policy_id, associated_policy_id) FROM stdin;
3a2723cf-e593-47b6-b18e-b92d62cae698	ce86cb9c-0f7e-48db-96aa-a1d0ac35c1b1
\.


--
-- Data for Name: authentication_execution; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.authentication_execution (id, alias, authenticator, realm_id, flow_id, requirement, priority, authenticator_flow, auth_flow_id, auth_config) FROM stdin;
6c2b9ef1-c0b3-435c-a1e1-5e069034a2cc	\N	auth-cookie	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d6b06077-e2fb-499f-b953-1396fd4ec1d6	2	10	f	\N	\N
0057e1c4-fc83-4357-8c6d-0e4ff2ffe63d	\N	auth-spnego	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d6b06077-e2fb-499f-b953-1396fd4ec1d6	3	20	f	\N	\N
da33fde0-5c48-4216-968c-8e5916ff72df	\N	identity-provider-redirector	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d6b06077-e2fb-499f-b953-1396fd4ec1d6	2	25	f	\N	\N
1daee7ba-f0d2-4516-abd9-866f4fc8e123	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d6b06077-e2fb-499f-b953-1396fd4ec1d6	2	30	t	cae5dea2-e998-4e82-8f61-52c76ab27538	\N
6f29c3d0-032d-4925-a7ec-88b4785876ee	\N	auth-username-password-form	192b747f-cc6b-4514-9904-8dc8d7e66dd2	cae5dea2-e998-4e82-8f61-52c76ab27538	0	10	f	\N	\N
68c8205e-a587-41e4-9df1-b44bb9fcdbcc	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	cae5dea2-e998-4e82-8f61-52c76ab27538	1	20	t	d6189495-a092-4f1b-a496-ac354f2b3753	\N
74f6692f-b029-4003-85f8-8e37cec2edb4	\N	conditional-user-configured	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d6189495-a092-4f1b-a496-ac354f2b3753	0	10	f	\N	\N
add58888-d365-454e-ba9d-823616cc572c	\N	auth-otp-form	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d6189495-a092-4f1b-a496-ac354f2b3753	0	20	f	\N	\N
2cc2a5e0-7ff3-44b0-9ed7-286f1b7e43bd	\N	direct-grant-validate-username	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f3639928-1e72-4487-813d-7e6ac4248bf2	0	10	f	\N	\N
b92f21da-00ae-4466-ba6f-eefee68c6a5d	\N	direct-grant-validate-password	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f3639928-1e72-4487-813d-7e6ac4248bf2	0	20	f	\N	\N
40070dc4-fe4b-4062-a51b-acbb25d38e62	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f3639928-1e72-4487-813d-7e6ac4248bf2	1	30	t	d943d520-7d3b-4012-bacf-e741c6ece5a2	\N
33ac83cb-7365-478c-ae64-7e04ec0d1dd2	\N	conditional-user-configured	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d943d520-7d3b-4012-bacf-e741c6ece5a2	0	10	f	\N	\N
a2004fa0-f49d-4b21-9ddc-a0a142a42dcd	\N	direct-grant-validate-otp	192b747f-cc6b-4514-9904-8dc8d7e66dd2	d943d520-7d3b-4012-bacf-e741c6ece5a2	0	20	f	\N	\N
24b6e83d-0662-4916-a22c-ceb1f86d1a52	\N	registration-page-form	192b747f-cc6b-4514-9904-8dc8d7e66dd2	4f8142fc-a08d-4158-b60a-359ff8d1968d	0	10	t	2d937ea8-ac93-4eb3-bfc1-50d9a02156d2	\N
6a907660-e570-4081-a589-b8223faef4dc	\N	registration-user-creation	192b747f-cc6b-4514-9904-8dc8d7e66dd2	2d937ea8-ac93-4eb3-bfc1-50d9a02156d2	0	20	f	\N	\N
6262c720-6c86-4c1e-a92e-90a6b5326ea0	\N	registration-password-action	192b747f-cc6b-4514-9904-8dc8d7e66dd2	2d937ea8-ac93-4eb3-bfc1-50d9a02156d2	0	50	f	\N	\N
5dcb3947-200b-4de9-9fc7-f55cb1dfadd5	\N	registration-recaptcha-action	192b747f-cc6b-4514-9904-8dc8d7e66dd2	2d937ea8-ac93-4eb3-bfc1-50d9a02156d2	3	60	f	\N	\N
ab3be524-7011-4af4-b28e-7616e4202147	\N	registration-terms-and-conditions	192b747f-cc6b-4514-9904-8dc8d7e66dd2	2d937ea8-ac93-4eb3-bfc1-50d9a02156d2	3	70	f	\N	\N
c950e42b-9e9e-4228-a50d-d0a6610dbd8f	\N	reset-credentials-choose-user	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9e03d963-b872-4adb-970b-7c1ace3b730f	0	10	f	\N	\N
5898465b-27ef-40bb-9aac-9ed1b76936df	\N	reset-credential-email	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9e03d963-b872-4adb-970b-7c1ace3b730f	0	20	f	\N	\N
b60046c8-10bf-4af2-aa4d-f93d6ab1e767	\N	reset-password	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9e03d963-b872-4adb-970b-7c1ace3b730f	0	30	f	\N	\N
5ae64056-e3ae-4bf4-9782-f597babed083	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9e03d963-b872-4adb-970b-7c1ace3b730f	1	40	t	15358650-8d7d-4a75-8cdf-60a3ac46450a	\N
526d9ff4-b1b7-44de-8b0a-9486abd9d5df	\N	conditional-user-configured	192b747f-cc6b-4514-9904-8dc8d7e66dd2	15358650-8d7d-4a75-8cdf-60a3ac46450a	0	10	f	\N	\N
93582d9a-4631-4ed5-985f-d508deb95f01	\N	reset-otp	192b747f-cc6b-4514-9904-8dc8d7e66dd2	15358650-8d7d-4a75-8cdf-60a3ac46450a	0	20	f	\N	\N
67148b53-ef61-4cd9-9138-896f1be89818	\N	client-secret	192b747f-cc6b-4514-9904-8dc8d7e66dd2	65d1466f-3453-4342-ab81-ba34ded7d8a9	2	10	f	\N	\N
f44c53f2-7089-4f1a-a876-8bddd78c8968	\N	client-jwt	192b747f-cc6b-4514-9904-8dc8d7e66dd2	65d1466f-3453-4342-ab81-ba34ded7d8a9	2	20	f	\N	\N
1e9a70ae-55cd-4d61-a86d-a5ecf26a6c44	\N	client-secret-jwt	192b747f-cc6b-4514-9904-8dc8d7e66dd2	65d1466f-3453-4342-ab81-ba34ded7d8a9	2	30	f	\N	\N
d35b4dec-220f-46eb-afc5-5b498523bf4a	\N	client-x509	192b747f-cc6b-4514-9904-8dc8d7e66dd2	65d1466f-3453-4342-ab81-ba34ded7d8a9	2	40	f	\N	\N
9ac9df82-a5d7-4803-834f-8ddcfa66a2b7	\N	idp-review-profile	192b747f-cc6b-4514-9904-8dc8d7e66dd2	b0330b9e-c035-4c90-bd6b-6b448bc02fe6	0	10	f	\N	5f40e9c2-d242-46ea-92da-d1cbbbb8890e
1a033a22-7a6e-4996-9e07-a1c937035485	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	b0330b9e-c035-4c90-bd6b-6b448bc02fe6	0	20	t	caab4e15-b3aa-4cb1-8d3d-e877ab1b1ecb	\N
3a385585-f26e-41d5-bcd3-f255bca3f2ab	\N	idp-create-user-if-unique	192b747f-cc6b-4514-9904-8dc8d7e66dd2	caab4e15-b3aa-4cb1-8d3d-e877ab1b1ecb	2	10	f	\N	64c84da7-5902-4a60-85d3-9019cba6b0e3
aef6fbb6-6da7-4d7e-b8df-7cf20bac0e9b	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	caab4e15-b3aa-4cb1-8d3d-e877ab1b1ecb	2	20	t	9fe1d3c3-18aa-4cee-ae34-376850c993b9	\N
6937745a-a261-4b8d-a22d-753b3e33e437	\N	idp-confirm-link	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9fe1d3c3-18aa-4cee-ae34-376850c993b9	0	10	f	\N	\N
94c97e37-06ee-4b35-9f76-6e06e055bcf6	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9fe1d3c3-18aa-4cee-ae34-376850c993b9	0	20	t	0ecb569b-4740-4d75-9c1e-9af938738bde	\N
40f8dbe5-1073-49fb-ab76-ee18c747483c	\N	idp-email-verification	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0ecb569b-4740-4d75-9c1e-9af938738bde	2	10	f	\N	\N
b1b05b40-d498-46c0-ae5b-f093496cab6e	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0ecb569b-4740-4d75-9c1e-9af938738bde	2	20	t	49805535-caf8-4aa5-976f-a73e2263da0d	\N
c1246f72-8f42-485e-aa2a-986f95dcc650	\N	idp-username-password-form	192b747f-cc6b-4514-9904-8dc8d7e66dd2	49805535-caf8-4aa5-976f-a73e2263da0d	0	10	f	\N	\N
8ce7ea61-5a19-4d99-b789-7215a15eee3f	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	49805535-caf8-4aa5-976f-a73e2263da0d	1	20	t	8bc387b2-192c-45da-aeff-c4c9a5d730e9	\N
fb426c30-e7e4-4f09-bb10-e1a857fc8b65	\N	conditional-user-configured	192b747f-cc6b-4514-9904-8dc8d7e66dd2	8bc387b2-192c-45da-aeff-c4c9a5d730e9	0	10	f	\N	\N
cf6a66d2-81d1-4008-a164-e51813d23168	\N	auth-otp-form	192b747f-cc6b-4514-9904-8dc8d7e66dd2	8bc387b2-192c-45da-aeff-c4c9a5d730e9	0	20	f	\N	\N
c4cb8c20-5746-492c-b283-bd698d3a88ac	\N	http-basic-authenticator	192b747f-cc6b-4514-9904-8dc8d7e66dd2	1f87ada9-1032-4b52-b3e7-718e0cd768b6	0	10	f	\N	\N
b17ef124-d674-4bef-9715-dd203e4d2a93	\N	docker-http-basic-authenticator	192b747f-cc6b-4514-9904-8dc8d7e66dd2	519c4253-5054-487e-87e9-25973853d50b	0	10	f	\N	\N
\.


--
-- Data for Name: authentication_flow; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.authentication_flow (id, alias, description, realm_id, provider_id, top_level, built_in) FROM stdin;
d6b06077-e2fb-499f-b953-1396fd4ec1d6	browser	Browser based authentication	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
cae5dea2-e998-4e82-8f61-52c76ab27538	forms	Username, password, otp and other auth forms.	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
d6189495-a092-4f1b-a496-ac354f2b3753	Browser - Conditional OTP	Flow to determine if the OTP is required for the authentication	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
f3639928-1e72-4487-813d-7e6ac4248bf2	direct grant	OpenID Connect Resource Owner Grant	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
d943d520-7d3b-4012-bacf-e741c6ece5a2	Direct Grant - Conditional OTP	Flow to determine if the OTP is required for the authentication	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
4f8142fc-a08d-4158-b60a-359ff8d1968d	registration	Registration flow	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
2d937ea8-ac93-4eb3-bfc1-50d9a02156d2	registration form	Registration form	192b747f-cc6b-4514-9904-8dc8d7e66dd2	form-flow	f	t
9e03d963-b872-4adb-970b-7c1ace3b730f	reset credentials	Reset credentials for a user if they forgot their password or something	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
15358650-8d7d-4a75-8cdf-60a3ac46450a	Reset - Conditional OTP	Flow to determine if the OTP should be reset or not. Set to REQUIRED to force.	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
65d1466f-3453-4342-ab81-ba34ded7d8a9	clients	Base authentication for clients	192b747f-cc6b-4514-9904-8dc8d7e66dd2	client-flow	t	t
b0330b9e-c035-4c90-bd6b-6b448bc02fe6	first broker login	Actions taken after first broker login with identity provider account, which is not yet linked to any Keycloak account	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
caab4e15-b3aa-4cb1-8d3d-e877ab1b1ecb	User creation or linking	Flow for the existing/non-existing user alternatives	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
9fe1d3c3-18aa-4cee-ae34-376850c993b9	Handle Existing Account	Handle what to do if there is existing account with same email/username like authenticated identity provider	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
0ecb569b-4740-4d75-9c1e-9af938738bde	Account verification options	Method with which to verity the existing account	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
49805535-caf8-4aa5-976f-a73e2263da0d	Verify Existing Account by Re-authentication	Reauthentication of existing account	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
8bc387b2-192c-45da-aeff-c4c9a5d730e9	First broker login - Conditional OTP	Flow to determine if the OTP is required for the authentication	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	f	t
1f87ada9-1032-4b52-b3e7-718e0cd768b6	saml ecp	SAML ECP Profile Authentication Flow	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
519c4253-5054-487e-87e9-25973853d50b	docker auth	Used by Docker clients to authenticate against the IDP	192b747f-cc6b-4514-9904-8dc8d7e66dd2	basic-flow	t	t
\.


--
-- Data for Name: authenticator_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.authenticator_config (id, alias, realm_id) FROM stdin;
5f40e9c2-d242-46ea-92da-d1cbbbb8890e	review profile config	192b747f-cc6b-4514-9904-8dc8d7e66dd2
64c84da7-5902-4a60-85d3-9019cba6b0e3	create unique user config	192b747f-cc6b-4514-9904-8dc8d7e66dd2
\.


--
-- Data for Name: authenticator_config_entry; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.authenticator_config_entry (authenticator_id, value, name) FROM stdin;
5f40e9c2-d242-46ea-92da-d1cbbbb8890e	missing	update.profile.on.first.login
64c84da7-5902-4a60-85d3-9019cba6b0e3	false	require.password.update.after.registration
\.


--
-- Data for Name: broker_link; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.broker_link (identity_provider, storage_provider_id, realm_id, broker_user_id, broker_username, token, user_id) FROM stdin;
\.


--
-- Data for Name: client; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client (id, enabled, full_scope_allowed, client_id, not_before, public_client, secret, base_url, bearer_only, management_url, surrogate_auth_required, realm_id, protocol, node_rereg_timeout, frontchannel_logout, consent_required, name, service_accounts_enabled, client_authenticator_type, root_url, description, registration_token, standard_flow_enabled, implicit_flow_enabled, direct_access_grants_enabled, always_display_in_console) FROM stdin;
64320c8d-e0bf-4432-9742-df7836b26849	t	f	master-realm	0	f	\N	\N	t	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N	0	f	f	master Realm	f	client-secret	\N	\N	\N	t	f	f	f
0343b55f-85c0-49db-bc27-0c2d06959dcd	t	f	account	0	t	\N	/realms/master/account/	f	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	openid-connect	0	f	f	${client_account}	f	client-secret	${authBaseUrl}	\N	\N	t	f	f	f
217d0422-e48a-453a-a745-d788b0cca2e2	t	f	account-console	0	t	\N	/realms/master/account/	f	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	openid-connect	0	f	f	${client_account-console}	f	client-secret	${authBaseUrl}	\N	\N	t	f	f	f
cf3794f6-c76d-4f0e-9840-4d690325b769	t	f	broker	0	f	\N	\N	t	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	openid-connect	0	f	f	${client_broker}	f	client-secret	\N	\N	\N	t	f	f	f
045191a1-6675-4196-88f8-c3d8834672ff	t	t	security-admin-console	0	t	\N	/admin/master/console/	f	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	openid-connect	0	f	f	${client_security-admin-console}	f	client-secret	${authAdminUrl}	\N	\N	t	f	f	f
a1e89f5a-da8e-4368-904d-560973e874fb	t	t	admin-cli	0	t	\N	\N	f	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	openid-connect	0	f	f	${client_admin-cli}	f	client-secret	\N	\N	\N	f	f	t	f
5ec31698-abf8-43e0-91e6-00f278c2cf8e	t	t	chanjo-client-apis	0	f	lbOutYrbQFvcWWe0yKPZibcu6ibsEEPr	\N	f	\N	f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	openid-connect	-1	f	f	ChanjoKE Custom APIs	t	client-secret	\N		\N	t	t	t	f
\.


--
-- Data for Name: client_attributes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_attributes (client_id, name, value) FROM stdin;
0343b55f-85c0-49db-bc27-0c2d06959dcd	post.logout.redirect.uris	+
217d0422-e48a-453a-a745-d788b0cca2e2	post.logout.redirect.uris	+
217d0422-e48a-453a-a745-d788b0cca2e2	pkce.code.challenge.method	S256
045191a1-6675-4196-88f8-c3d8834672ff	post.logout.redirect.uris	+
045191a1-6675-4196-88f8-c3d8834672ff	pkce.code.challenge.method	S256
045191a1-6675-4196-88f8-c3d8834672ff	client.use.lightweight.access.token.enabled	true
a1e89f5a-da8e-4368-904d-560973e874fb	client.use.lightweight.access.token.enabled	true
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.force.post.binding	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.multivalued.roles	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	frontchannel.logout.session.required	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	oauth2.device.authorization.grant.enabled	true
5ec31698-abf8-43e0-91e6-00f278c2cf8e	backchannel.logout.revoke.offline.tokens	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.server.signature.keyinfo.ext	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	use.refresh.tokens	true
5ec31698-abf8-43e0-91e6-00f278c2cf8e	oidc.ciba.grant.enabled	true
5ec31698-abf8-43e0-91e6-00f278c2cf8e	backchannel.logout.session.required	true
5ec31698-abf8-43e0-91e6-00f278c2cf8e	client_credentials.use_refresh_token	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	require.pushed.authorization.requests	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.client.signature	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.allow.ecp.flow	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	id.token.as.detached.signature	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.assertion.signature	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	client.secret.creation.time	1705527472
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.encrypt	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.server.signature	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	exclude.session.state.from.auth.response	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.artifact.binding	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml_force_name_id_format	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	acr.loa.map	{}
5ec31698-abf8-43e0-91e6-00f278c2cf8e	tls.client.certificate.bound.access.tokens	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.authnstatement	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	display.on.consent.screen	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	token.response.type.bearer.lower-case	false
5ec31698-abf8-43e0-91e6-00f278c2cf8e	saml.onetimeuse.condition	false
\.


--
-- Data for Name: client_auth_flow_bindings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_auth_flow_bindings (client_id, flow_id, binding_name) FROM stdin;
\.


--
-- Data for Name: client_initial_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_initial_access (id, realm_id, "timestamp", expiration, count, remaining_count) FROM stdin;
\.


--
-- Data for Name: client_node_registrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_node_registrations (client_id, value, name) FROM stdin;
\.


--
-- Data for Name: client_scope; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_scope (id, name, realm_id, description, protocol) FROM stdin;
4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	offline_access	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect built-in scope: offline_access	openid-connect
1495b7b0-fc0b-4545-bb13-699b884ece27	role_list	192b747f-cc6b-4514-9904-8dc8d7e66dd2	SAML role list	saml
6b7f2ddd-a2f3-477c-8fa5-cc6de6e2737a	saml_organization	192b747f-cc6b-4514-9904-8dc8d7e66dd2	Organization Membership	saml
c61f3a1b-521c-43d3-ba07-3948e69e8220	profile	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect built-in scope: profile	openid-connect
1ec773bb-8239-4d27-8b17-d2048896323e	email	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect built-in scope: email	openid-connect
6dfefdb0-933e-42e7-96da-059e0a453301	address	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect built-in scope: address	openid-connect
92c3d6b6-0019-4eb6-a1b3-26014c7c155f	phone	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect built-in scope: phone	openid-connect
21b29af3-f84f-40a3-8e19-75b76ef0bec9	roles	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect scope for add user roles to the access token	openid-connect
3578efd1-5e65-44bd-a6b2-7c5d55db277b	web-origins	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect scope for add allowed web origins to the access token	openid-connect
a016c5f1-6f8d-447e-afb0-3372328f2e40	microprofile-jwt	192b747f-cc6b-4514-9904-8dc8d7e66dd2	Microprofile - JWT built-in scope	openid-connect
f1efa0ae-1d9d-47cb-9aed-aa75751e3957	acr	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect scope for add acr (authentication context class reference) to the token	openid-connect
126579ad-b242-4ea2-8137-62ba3fe6712b	basic	192b747f-cc6b-4514-9904-8dc8d7e66dd2	OpenID Connect scope for add all basic claims to the token	openid-connect
e097dd72-2a08-4eae-9a07-b7308fcd4dbe	organization	192b747f-cc6b-4514-9904-8dc8d7e66dd2	Additional claims about the organization a subject belongs to	openid-connect
bef04169-ddc4-4e93-8ed6-a14c52309182	openid	192b747f-cc6b-4514-9904-8dc8d7e66dd2		openid-connect
\.


--
-- Data for Name: client_scope_attributes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_scope_attributes (scope_id, value, name) FROM stdin;
4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	true	display.on.consent.screen
4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	${offlineAccessScopeConsentText}	consent.screen.text
1495b7b0-fc0b-4545-bb13-699b884ece27	true	display.on.consent.screen
1495b7b0-fc0b-4545-bb13-699b884ece27	${samlRoleListScopeConsentText}	consent.screen.text
6b7f2ddd-a2f3-477c-8fa5-cc6de6e2737a	false	display.on.consent.screen
c61f3a1b-521c-43d3-ba07-3948e69e8220	true	display.on.consent.screen
c61f3a1b-521c-43d3-ba07-3948e69e8220	${profileScopeConsentText}	consent.screen.text
c61f3a1b-521c-43d3-ba07-3948e69e8220	true	include.in.token.scope
1ec773bb-8239-4d27-8b17-d2048896323e	true	display.on.consent.screen
1ec773bb-8239-4d27-8b17-d2048896323e	${emailScopeConsentText}	consent.screen.text
1ec773bb-8239-4d27-8b17-d2048896323e	true	include.in.token.scope
6dfefdb0-933e-42e7-96da-059e0a453301	true	display.on.consent.screen
6dfefdb0-933e-42e7-96da-059e0a453301	${addressScopeConsentText}	consent.screen.text
6dfefdb0-933e-42e7-96da-059e0a453301	true	include.in.token.scope
92c3d6b6-0019-4eb6-a1b3-26014c7c155f	true	display.on.consent.screen
92c3d6b6-0019-4eb6-a1b3-26014c7c155f	${phoneScopeConsentText}	consent.screen.text
92c3d6b6-0019-4eb6-a1b3-26014c7c155f	true	include.in.token.scope
21b29af3-f84f-40a3-8e19-75b76ef0bec9	true	display.on.consent.screen
21b29af3-f84f-40a3-8e19-75b76ef0bec9	${rolesScopeConsentText}	consent.screen.text
21b29af3-f84f-40a3-8e19-75b76ef0bec9	false	include.in.token.scope
3578efd1-5e65-44bd-a6b2-7c5d55db277b	false	display.on.consent.screen
3578efd1-5e65-44bd-a6b2-7c5d55db277b		consent.screen.text
3578efd1-5e65-44bd-a6b2-7c5d55db277b	false	include.in.token.scope
a016c5f1-6f8d-447e-afb0-3372328f2e40	false	display.on.consent.screen
a016c5f1-6f8d-447e-afb0-3372328f2e40	true	include.in.token.scope
f1efa0ae-1d9d-47cb-9aed-aa75751e3957	false	display.on.consent.screen
f1efa0ae-1d9d-47cb-9aed-aa75751e3957	false	include.in.token.scope
126579ad-b242-4ea2-8137-62ba3fe6712b	false	display.on.consent.screen
126579ad-b242-4ea2-8137-62ba3fe6712b	false	include.in.token.scope
e097dd72-2a08-4eae-9a07-b7308fcd4dbe	true	display.on.consent.screen
e097dd72-2a08-4eae-9a07-b7308fcd4dbe	${organizationScopeConsentText}	consent.screen.text
e097dd72-2a08-4eae-9a07-b7308fcd4dbe	true	include.in.token.scope
bef04169-ddc4-4e93-8ed6-a14c52309182	true	display.on.consent.screen
bef04169-ddc4-4e93-8ed6-a14c52309182		consent.screen.text
bef04169-ddc4-4e93-8ed6-a14c52309182		gui.order
bef04169-ddc4-4e93-8ed6-a14c52309182	true	include.in.token.scope
\.


--
-- Data for Name: client_scope_client; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_scope_client (client_id, scope_id, default_scope) FROM stdin;
0343b55f-85c0-49db-bc27-0c2d06959dcd	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
0343b55f-85c0-49db-bc27-0c2d06959dcd	1ec773bb-8239-4d27-8b17-d2048896323e	t
0343b55f-85c0-49db-bc27-0c2d06959dcd	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
0343b55f-85c0-49db-bc27-0c2d06959dcd	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
0343b55f-85c0-49db-bc27-0c2d06959dcd	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
0343b55f-85c0-49db-bc27-0c2d06959dcd	126579ad-b242-4ea2-8137-62ba3fe6712b	t
0343b55f-85c0-49db-bc27-0c2d06959dcd	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
0343b55f-85c0-49db-bc27-0c2d06959dcd	6dfefdb0-933e-42e7-96da-059e0a453301	f
0343b55f-85c0-49db-bc27-0c2d06959dcd	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
0343b55f-85c0-49db-bc27-0c2d06959dcd	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
0343b55f-85c0-49db-bc27-0c2d06959dcd	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
217d0422-e48a-453a-a745-d788b0cca2e2	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
217d0422-e48a-453a-a745-d788b0cca2e2	1ec773bb-8239-4d27-8b17-d2048896323e	t
217d0422-e48a-453a-a745-d788b0cca2e2	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
217d0422-e48a-453a-a745-d788b0cca2e2	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
217d0422-e48a-453a-a745-d788b0cca2e2	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
217d0422-e48a-453a-a745-d788b0cca2e2	126579ad-b242-4ea2-8137-62ba3fe6712b	t
217d0422-e48a-453a-a745-d788b0cca2e2	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
217d0422-e48a-453a-a745-d788b0cca2e2	6dfefdb0-933e-42e7-96da-059e0a453301	f
217d0422-e48a-453a-a745-d788b0cca2e2	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
217d0422-e48a-453a-a745-d788b0cca2e2	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
217d0422-e48a-453a-a745-d788b0cca2e2	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
a1e89f5a-da8e-4368-904d-560973e874fb	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
a1e89f5a-da8e-4368-904d-560973e874fb	1ec773bb-8239-4d27-8b17-d2048896323e	t
a1e89f5a-da8e-4368-904d-560973e874fb	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
a1e89f5a-da8e-4368-904d-560973e874fb	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
a1e89f5a-da8e-4368-904d-560973e874fb	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
a1e89f5a-da8e-4368-904d-560973e874fb	126579ad-b242-4ea2-8137-62ba3fe6712b	t
a1e89f5a-da8e-4368-904d-560973e874fb	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
a1e89f5a-da8e-4368-904d-560973e874fb	6dfefdb0-933e-42e7-96da-059e0a453301	f
a1e89f5a-da8e-4368-904d-560973e874fb	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
a1e89f5a-da8e-4368-904d-560973e874fb	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
a1e89f5a-da8e-4368-904d-560973e874fb	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
cf3794f6-c76d-4f0e-9840-4d690325b769	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
cf3794f6-c76d-4f0e-9840-4d690325b769	1ec773bb-8239-4d27-8b17-d2048896323e	t
cf3794f6-c76d-4f0e-9840-4d690325b769	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
cf3794f6-c76d-4f0e-9840-4d690325b769	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
cf3794f6-c76d-4f0e-9840-4d690325b769	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
cf3794f6-c76d-4f0e-9840-4d690325b769	126579ad-b242-4ea2-8137-62ba3fe6712b	t
cf3794f6-c76d-4f0e-9840-4d690325b769	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
cf3794f6-c76d-4f0e-9840-4d690325b769	6dfefdb0-933e-42e7-96da-059e0a453301	f
cf3794f6-c76d-4f0e-9840-4d690325b769	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
cf3794f6-c76d-4f0e-9840-4d690325b769	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
cf3794f6-c76d-4f0e-9840-4d690325b769	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
64320c8d-e0bf-4432-9742-df7836b26849	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
64320c8d-e0bf-4432-9742-df7836b26849	1ec773bb-8239-4d27-8b17-d2048896323e	t
64320c8d-e0bf-4432-9742-df7836b26849	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
64320c8d-e0bf-4432-9742-df7836b26849	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
64320c8d-e0bf-4432-9742-df7836b26849	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
64320c8d-e0bf-4432-9742-df7836b26849	126579ad-b242-4ea2-8137-62ba3fe6712b	t
64320c8d-e0bf-4432-9742-df7836b26849	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
64320c8d-e0bf-4432-9742-df7836b26849	6dfefdb0-933e-42e7-96da-059e0a453301	f
64320c8d-e0bf-4432-9742-df7836b26849	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
64320c8d-e0bf-4432-9742-df7836b26849	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
64320c8d-e0bf-4432-9742-df7836b26849	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
045191a1-6675-4196-88f8-c3d8834672ff	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
045191a1-6675-4196-88f8-c3d8834672ff	1ec773bb-8239-4d27-8b17-d2048896323e	t
045191a1-6675-4196-88f8-c3d8834672ff	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
045191a1-6675-4196-88f8-c3d8834672ff	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
045191a1-6675-4196-88f8-c3d8834672ff	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
045191a1-6675-4196-88f8-c3d8834672ff	126579ad-b242-4ea2-8137-62ba3fe6712b	t
045191a1-6675-4196-88f8-c3d8834672ff	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
045191a1-6675-4196-88f8-c3d8834672ff	6dfefdb0-933e-42e7-96da-059e0a453301	f
045191a1-6675-4196-88f8-c3d8834672ff	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
045191a1-6675-4196-88f8-c3d8834672ff	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
045191a1-6675-4196-88f8-c3d8834672ff	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
5ec31698-abf8-43e0-91e6-00f278c2cf8e	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	1ec773bb-8239-4d27-8b17-d2048896323e	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	6dfefdb0-933e-42e7-96da-059e0a453301	f
5ec31698-abf8-43e0-91e6-00f278c2cf8e	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
5ec31698-abf8-43e0-91e6-00f278c2cf8e	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
5ec31698-abf8-43e0-91e6-00f278c2cf8e	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
5ec31698-abf8-43e0-91e6-00f278c2cf8e	bef04169-ddc4-4e93-8ed6-a14c52309182	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	t
5ec31698-abf8-43e0-91e6-00f278c2cf8e	126579ad-b242-4ea2-8137-62ba3fe6712b	t
\.


--
-- Data for Name: client_scope_role_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_scope_role_mapping (scope_id, role_id) FROM stdin;
4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	2e482ccc-26b9-4a76-bc89-74da3337e442
\.


--
-- Data for Name: component; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.component (id, name, parent_id, provider_id, provider_type, realm_id, sub_type) FROM stdin;
bbb13187-fbe2-4c2c-b458-8744c7f7a69a	Trusted Hosts	192b747f-cc6b-4514-9904-8dc8d7e66dd2	trusted-hosts	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	anonymous
ae92aa03-6f9a-4248-8ff1-aa7b304f6ce2	Consent Required	192b747f-cc6b-4514-9904-8dc8d7e66dd2	consent-required	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	anonymous
5a9568ac-b5d9-48b4-b19c-b4d682b3e3c4	Full Scope Disabled	192b747f-cc6b-4514-9904-8dc8d7e66dd2	scope	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	anonymous
ce8f3c2c-9b1b-4e0d-b236-08b975d9c5be	Max Clients Limit	192b747f-cc6b-4514-9904-8dc8d7e66dd2	max-clients	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	anonymous
92286740-222a-4a36-87cc-d3eb3c4dad9a	Allowed Protocol Mapper Types	192b747f-cc6b-4514-9904-8dc8d7e66dd2	allowed-protocol-mappers	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	anonymous
e006b4a4-6c0a-4b76-85b5-11ccc22b118c	Allowed Client Scopes	192b747f-cc6b-4514-9904-8dc8d7e66dd2	allowed-client-templates	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	anonymous
51bc2917-3a04-4706-8d34-f7eaf634124f	Allowed Protocol Mapper Types	192b747f-cc6b-4514-9904-8dc8d7e66dd2	allowed-protocol-mappers	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	authenticated
5f27b640-bcdc-4bee-87bc-3353d9103ff4	Allowed Client Scopes	192b747f-cc6b-4514-9904-8dc8d7e66dd2	allowed-client-templates	org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	authenticated
82dfef7d-21a0-438c-b413-599811e7a78d	rsa-generated	192b747f-cc6b-4514-9904-8dc8d7e66dd2	rsa-generated	org.keycloak.keys.KeyProvider	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N
86656ee3-1c70-48c2-a027-9a7dacb61aae	rsa-enc-generated	192b747f-cc6b-4514-9904-8dc8d7e66dd2	rsa-enc-generated	org.keycloak.keys.KeyProvider	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N
17a20ac0-611a-4f00-8e1b-68558b8dd7fe	hmac-generated-hs512	192b747f-cc6b-4514-9904-8dc8d7e66dd2	hmac-generated	org.keycloak.keys.KeyProvider	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N
393e2bf9-950e-43bc-8cd9-c19ec5d4a50f	aes-generated	192b747f-cc6b-4514-9904-8dc8d7e66dd2	aes-generated	org.keycloak.keys.KeyProvider	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N
3373b11b-3da6-47f5-bf32-c5fa550966cb	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	declarative-user-profile	org.keycloak.userprofile.UserProfileProvider	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N
\.


--
-- Data for Name: component_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.component_config (id, component_id, name, value) FROM stdin;
0dc76806-387d-4a4e-b824-cf38027442a4	ce8f3c2c-9b1b-4e0d-b236-08b975d9c5be	max-clients	200
77a41892-b07e-456c-af47-14746ecb64da	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	saml-user-attribute-mapper
b6bf9882-d1b2-48b6-89c5-3422babc9f0e	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	oidc-usermodel-attribute-mapper
2ce23ece-25ce-4f91-a142-0426a77639a0	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	saml-user-property-mapper
6ca55c5d-3b92-4133-845a-25a964db7959	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	oidc-full-name-mapper
4c602fb7-1bd9-4b73-8ba8-d5bde1990b27	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	oidc-usermodel-property-mapper
9f4c06fd-c0ca-4fc4-9d8c-5584e2ff17f0	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	saml-role-list-mapper
14de7005-fc7e-47fc-9703-a8c8251c7b8d	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	oidc-sha256-pairwise-sub-mapper
de78dc48-9da7-4d0c-a4d3-00313aa1bad4	51bc2917-3a04-4706-8d34-f7eaf634124f	allowed-protocol-mapper-types	oidc-address-mapper
c74d7bde-f85c-4dc8-bfd1-22f7eba44442	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	oidc-full-name-mapper
c0a10414-3948-499e-bd74-57c19073f083	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	oidc-address-mapper
e8da74f4-e678-48c5-9e39-08995f57cc5f	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	saml-user-property-mapper
535588ab-0c79-4169-b476-085d2714ab42	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	saml-role-list-mapper
380efb13-898b-465d-acad-a984ac1c0b45	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	oidc-usermodel-attribute-mapper
8fad8eb0-6449-4e41-b28d-787a8624b12b	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	saml-user-attribute-mapper
d6c9e93d-0edd-448a-900a-844b3e3040f2	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	oidc-sha256-pairwise-sub-mapper
bb2b39e1-ba4c-4e57-979b-17041f235293	92286740-222a-4a36-87cc-d3eb3c4dad9a	allowed-protocol-mapper-types	oidc-usermodel-property-mapper
86de3aca-ddac-4060-842f-a177a3aa8ff7	e006b4a4-6c0a-4b76-85b5-11ccc22b118c	allow-default-scopes	true
875db9fd-11fb-4e74-a5f8-84cf1bf0b260	5f27b640-bcdc-4bee-87bc-3353d9103ff4	allow-default-scopes	true
dfd597f2-ebbb-4f93-bf1b-2e8e1990f90f	bbb13187-fbe2-4c2c-b458-8744c7f7a69a	client-uris-must-match	true
1d64253f-f761-4aa1-81a1-f31ad724cd29	bbb13187-fbe2-4c2c-b458-8744c7f7a69a	host-sending-registration-request-must-match	true
e6259de9-c51f-4dc3-af23-c2dc0e6849f7	82dfef7d-21a0-438c-b413-599811e7a78d	privateKey	MIIEpAIBAAKCAQEAxbdV7ArosBEjo5O6bX7+zrWM1kDLaVzX7zbjTPRwMjrQkXOOgM+TOZfzmuHxU+RDQ32DL1kFkVuu2diM1jq5uyQg0e4OEZdPqe+LviRrnZ14j+JIEs/k1oeUeSXl3XwZtd4SNXEPgSX4Ll3vywYkvYiaBnWb7tyd09i14q8xiHcf0/2M+FcqJ4pL/SZEQxFJNvrCwJmSlZDLkTbi8441EkRrC5sWlTGK65g61XRGekt6g/RnnH+vqBJMFZ9AOBp0H6SCvDaiJkLon0lUFs6a9VNR5J+1DnqGi8rIMtuisYx66qo6Hbjc8BiZw12XXqJPdtP36nRli3y4A4jmbiZx9wIDAQABAoIBABR5dSm0bNQ5ciSxBPqXJBvpK7nO4UGlSQHkqoqAOv4jSRCcPtg9UVRYKp88tpj8ElsdgZrtmmirGI2b9zmtaykOB2K18Y8GHvciGf6JbFDYyxtbUMth6/irTEd0vTu/wN8sgrDgvGegtEquP57D9sS0g1QX6cXv4rLaxjsV7rM1iYPRuV23XOmYGwEVmVTVHaXJ5moD0GtctyaxU1wNeysKp/lMixXc9YSRRsznazDO/9DkRjAl4vm39ewhpb+n2m4uhNdzppygtaslNumZ0d/tOpsR9iZ35Q5KVZLYUTCVk/kbZERFACKEakKTpzmYvx69Vn3qKMVfZq5xhf7rNgECgYEA64hZAmdqhlVduCHetNzZS9mrfJ+RqP/gq5QWeLI0I2bnR3+tpAt51ZFbGRaj9fOQx6HXxLJ/mqkmtINZ/aIkZjiF74b7rMK/n1N8neOhbJYa7XirhNBfHUqpAYt8cOHdxekoDSaNshm2kuJGDgn1nXs4RtK+f1uZWErGpm+JdVcCgYEA1uW5Xm2wymlFc2wBQfRPO57Pd6wpnl/7EeDX0AzP/Tri6Nq4RXvVqDfh+KxFmSSsMLmFSLhBjGkILEoQR3crsLsGhU10KpcKSo8V9rjuyQM2/TSomYsht0eXuOD9EXzxoNZHbg9DJIS738m7uyArAiwGUgN3rxTseaeM3ui9ZGECgYEAlAZpCl28URitgd+ne7ugxU7Tu8r9XF0T8kFrrgcxRV6S1BimJIch1ts3iZj1Cso8n3pThMc58xWDwccbc4/HmIbFhjgrS/RJQfTSSNiaxwe/fKduBFaAsIQPm2zylG8fVhammT01qE0ItV+H76LKvmKGh9xC5P/Ia/jyx/8pQJkCgYAjxwVQmlSHrnUYnU+sSl9ynqMN2oTnUDV9qYBkq+1ozIgAmoF5V/+fTQZ7HztLHtboGcr962dGWCo7LW1+aHHGr6yLPvTrLlBRT3cpp2ph3v4ls8GqJobLe8jfx916LuIPk/06bqIQD2U0AeMWaWmfp/K5bshbRtGEA4gpiHgXoQKBgQDbp3VWczVxguAP/oO0XG/g0379gqzsP2L2HwfdlLegKfleZDdmLlKeaTgP5v0qYccSfZVCANNB2aqliCG1nmynGC+h271+SANHuFSpiBQLDJBsbhmP39cOmFD8ddi3kLCHD5jJKQI9c465jrcgSZCsyQvskTmD1K0Cf09lJT56wA==
b95f20b1-8a35-41f7-ba58-ad656f779d97	82dfef7d-21a0-438c-b413-599811e7a78d	certificate	MIICmzCCAYMCBgGWQxwF3zANBgkqhkiG9w0BAQsFADARMQ8wDQYDVQQDDAZtYXN0ZXIwHhcNMjUwNDE3MDkzNTMyWhcNMzUwNDE3MDkzNzEyWjARMQ8wDQYDVQQDDAZtYXN0ZXIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDFt1XsCuiwESOjk7ptfv7OtYzWQMtpXNfvNuNM9HAyOtCRc46Az5M5l/Oa4fFT5ENDfYMvWQWRW67Z2IzWOrm7JCDR7g4Rl0+p74u+JGudnXiP4kgSz+TWh5R5JeXdfBm13hI1cQ+BJfguXe/LBiS9iJoGdZvu3J3T2LXirzGIdx/T/Yz4Vyonikv9JkRDEUk2+sLAmZKVkMuRNuLzjjUSRGsLmxaVMYrrmDrVdEZ6S3qD9Gecf6+oEkwVn0A4GnQfpIK8NqImQuifSVQWzpr1U1Hkn7UOeoaLysgy26KxjHrqqjoduNzwGJnDXZdeok920/fqdGWLfLgDiOZuJnH3AgMBAAEwDQYJKoZIhvcNAQELBQADggEBACQDqiTWcRt+j/gLKqC/7itzXr7g2mIsHaD0LtgcjuBehkQ5TCsyHRP7FILEEGIgwb4m0Mz6VmUf3gHhnf2zf2KqvUIX7Y9P8N2PT8EH5Y6Autgdva3JiB8MGXy4K99An9gFPegI8et70QoxMDqdMEvinPnOnRX6b8v0Di26agsRfHNBkRe8pjX1jezlxGAxOQOkQaN1UfHtASF5AkO1Wv+a8cxKFuHDBni3HPsFt/dDcYdKW8TQwi5VZ4c5/dEdTIcVW9XoGNsVGSSyJP/JD79YHYk0YyGVNb2nvHIOCvrVE12zo6rwGc9CEKSDJ7lYgZzhSpGq2VyauSd3TtGPJGU=
18541c30-a8f7-4533-b240-d28f1dfc1daf	82dfef7d-21a0-438c-b413-599811e7a78d	keyUse	SIG
1e1b6361-2e8b-404e-9c6b-83ebbb4bcf9b	82dfef7d-21a0-438c-b413-599811e7a78d	priority	100
21d8ed4d-fa00-4377-bedf-d905bf77cb9e	17a20ac0-611a-4f00-8e1b-68558b8dd7fe	secret	2Mxl3qUrqZH3zRpOT7gITlcoiK7XdwG5p64ZDAoKr5KZKvEBamqP6OOP2cxYWzv4RjfAoLWxDb8T915AEiYs7cIZ0q5oE2Y2-HXFeu3zbfeSVrtxj7ddd0x7aG-REAy0oBcbBFgaT5Cv2dHRjMUfpmyxjafD44otg3bVhdAuW8s
7b563f33-8c7b-4fbc-be3f-bb664560da7d	17a20ac0-611a-4f00-8e1b-68558b8dd7fe	priority	100
87fb5df7-5e71-49bb-ad58-69cec559ea49	17a20ac0-611a-4f00-8e1b-68558b8dd7fe	kid	eb33cb4b-93d6-4659-a61c-0f93fca963f5
a23dd427-40d3-4b5e-a603-195ff8943053	17a20ac0-611a-4f00-8e1b-68558b8dd7fe	algorithm	HS512
79c63ec1-7c70-4d16-b6c7-7e33042b08a5	86656ee3-1c70-48c2-a027-9a7dacb61aae	privateKey	MIIEowIBAAKCAQEA5dl9AgK371bFxCKba55+tRY/i/bWJDt50+o2ZDiJIebLlPBrzz3MrATN/ZwzvZ4NxBVMhLq2hlkDhUmGSKEtTGYS/uxFa0mMZY4LKcVslBGx5Tam1CiWEKzWnA91My5oRoLSkdg75E5H+LiEAK25rqnrIGgvcieU7lSzXGO0wgAV9xrWKgloOYis1AvgQZ8aBncOZXBb4PVRoFzt5znrVQ+hyrOFPRR8f0lS1EJqhlbjeW5AQeHECWvkc5IHelS4THhprIPBvK77oH5jGgdfMBupzJCoQ5y7b7nHMvpJ4qJMmfwHd4t9eAqAs+qgTAzQMfyYXmLO08sO6J0/+AIC/wIDAQABAoIBABhNjj+zrOIkISYTaK6Q5CHel9qDP3I2TbPf/F9NcQaCIj19zFBt3uHDYkpyBTCD8T2t6NjR6zG6YLpro0Szshf1ZQXKUq686JjmU3zXsJrZYh9zz2D4Z6GcvNZkdgZy3jiyZXRhUjfaJRcB34c41zzGH6PeEEI4ODGZCBv5OOgYKe5Bi3HOU9Cf9WidWCW5wlMDqrTwTvzJ5ncEp+vi+DW3VHFaAgnmbNh+YMxWgJZhV6oOkUdKdczouWvpx+RAsHupwuzHRuWJD32EccBGUDf3e7LUnA/UaLOqYFtFW8+4eFHrLGfVnVzMxhROba20kQnGR5yPxAtti2wNP0kuw+ECgYEA80j2HHm9w+LtPNLi1SP4fvtoXw+/GI84W+8HCZHdNDwz69JsowCZXkFiZtMkmYPhwDD5ysCbvHUbkM8qRtRewdAu2DJloQ3QfFmR5A7YjoV26jq5/Gzrs2lSe9G6tZ3hA0inerfUmuPcG6oC/negmj/4Hz2VJrks9QLhbV9xR2ECgYEA8dzEXok8dCWzzO7moLdIqA5A2JQItgG9uecVdvXsM0Hh7g/Uh3gu1tVAVTYjRLPYKcnu7su0tX7nc0w2suK2HaHxNvIMHHp8HZ0wdl9RvtS7s92PtO3RuaWI5M0BLbXiVLNN/7LD05U6pVq365BmkV4x3MoCVYvrhZWKo2v0Rl8CgYBaFVskQiP1Q7LKwd/CQnaCNn94K7F725Rn3kNB1OQOsngbSyh01wTzNMzF/EriGUZfTwM/g0BncQmK/lrOLVcE9xxRa5/cGexoDxaJVsHzTBIzOxmhEYfZQBeNx6QWGea2u5FgTG+KBvN6vuIq7YrncuZiUwBGfWzbMHzebefZIQKBgQDn4TCjMg+zizIGmESkcRRHiuLAwaxYUvMC+Hmrw7rgqZliE+s+tgqyDWHQUEcf5wyng+J/Lu3h0/kyoS8P8iuH3WrVstnJs+Sqv7lmw5wryOjsWM8eN6OKyRmlwqYOnQKREhcFvu3gPIItZfxO6/JqDFThyQrT2YHEYMq6QxW/IQKBgD2ULjqXBMUjBXRGZmTnZKHVIPTI2yQpcLGdNqPDFnS14m8ftAoSU/oWcEUgkPVPp8ob/iQ1S2Itr02hA5YRhQHYbKckBlEh/WUsc3kHmylidit/iFmRpPjnC54p2otwX62xh73pdj9LEECYkAqYwo9AUop8KOkLnkPYna/NScRp
1f2740f2-4d56-4a3c-9d65-924a3862bc9a	86656ee3-1c70-48c2-a027-9a7dacb61aae	certificate	MIICmzCCAYMCBgGWQxwGNzANBgkqhkiG9w0BAQsFADARMQ8wDQYDVQQDDAZtYXN0ZXIwHhcNMjUwNDE3MDkzNTMyWhcNMzUwNDE3MDkzNzEyWjARMQ8wDQYDVQQDDAZtYXN0ZXIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDl2X0CArfvVsXEIptrnn61Fj+L9tYkO3nT6jZkOIkh5suU8GvPPcysBM39nDO9ng3EFUyEuraGWQOFSYZIoS1MZhL+7EVrSYxljgspxWyUEbHlNqbUKJYQrNacD3UzLmhGgtKR2DvkTkf4uIQArbmuqesgaC9yJ5TuVLNcY7TCABX3GtYqCWg5iKzUC+BBnxoGdw5lcFvg9VGgXO3nOetVD6HKs4U9FHx/SVLUQmqGVuN5bkBB4cQJa+Rzkgd6VLhMeGmsg8G8rvugfmMaB18wG6nMkKhDnLtvuccy+kniokyZ/Ad3i314CoCz6qBMDNAx/JheYs7Tyw7onT/4AgL/AgMBAAEwDQYJKoZIhvcNAQELBQADggEBABkvwuzPzWq9CszmE46pUTNe86M0/iJvWFJdV5l/baVsX/KRJgpSdAnrG1yiWmZ353y5xWDPJ52Cw8HRvNyaPmJyOIlv+Yp87WZ7k6cdSfnz65kh8lza8jX1dcKUkfHyUuBrVa9LGa8NY402Gb3YrNG9eVpAnalby7Noa3VJs0sGLhf93LG9ziqBFhNjZBMsMiqDUr8ScHSJF27ab4q5cLWfR/4BoTu0C8lUi45cUXkZvShXPPKMa5vamBE4y//8FKYPY1n6cJja66ODKGBaPdPXxsyVVmeYf+hFZyFxAbZde/dUZwVGbN+Y5T1gbMGa3iREfVuQlONhUH57e/+4tWY=
cea7d7d6-fd80-4a75-a413-05f47cb73f04	86656ee3-1c70-48c2-a027-9a7dacb61aae	algorithm	RSA-OAEP
3064a3f9-0271-4b21-85d3-831a2a4cf3c6	86656ee3-1c70-48c2-a027-9a7dacb61aae	priority	100
584d929a-f879-438b-88a9-67bd7317ceec	86656ee3-1c70-48c2-a027-9a7dacb61aae	keyUse	ENC
e52eccc4-0c8b-406f-92a3-08ccea7d6504	3373b11b-3da6-47f5-bf32-c5fa550966cb	kc.user.profile.config	{"attributes":[{"name":"username","displayName":"${username}","validations":{"length":{"min":3,"max":255},"username-prohibited-characters":{},"up-username-not-idn-homograph":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},{"name":"email","displayName":"${email}","validations":{"email":{},"length":{"max":255}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},{"name":"firstName","displayName":"${firstName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false},{"name":"lastName","displayName":"${lastName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]},"multivalued":false}],"groups":[{"name":"user-metadata","displayHeader":"User metadata","displayDescription":"Attributes, which refer to user metadata"}]}
a62266eb-014b-468c-9cd9-8a018e43d587	393e2bf9-950e-43bc-8cd9-c19ec5d4a50f	priority	100
34363128-f93c-4b3c-9b42-5725fa2965cb	393e2bf9-950e-43bc-8cd9-c19ec5d4a50f	secret	r2sIUhfds3bTcd3i4ycnXw
e32934e7-0d45-4fa3-b8f9-599aa0b125c2	393e2bf9-950e-43bc-8cd9-c19ec5d4a50f	kid	4bd2a708-2e56-4bb2-bf9f-1031c28207b4
\.


--
-- Data for Name: composite_role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.composite_role (composite, child_role) FROM stdin;
02ba84df-bb65-43e3-8916-5e518699231d	ee2f1373-6ac5-49d7-98e3-a0ffdad2675f
02ba84df-bb65-43e3-8916-5e518699231d	758952b9-aa37-44b1-9f02-f771314a93be
02ba84df-bb65-43e3-8916-5e518699231d	c27cfc75-9308-40f4-b569-e37fa24b231d
02ba84df-bb65-43e3-8916-5e518699231d	29803f4d-ad19-401d-a525-6f065f7cf98c
02ba84df-bb65-43e3-8916-5e518699231d	e21ca91f-b8a1-4142-9436-62d6d2d194c2
02ba84df-bb65-43e3-8916-5e518699231d	f19f2df2-dc83-4781-9462-36f430c852f5
02ba84df-bb65-43e3-8916-5e518699231d	058594e4-107b-41b1-872b-86d8d8dceb4e
02ba84df-bb65-43e3-8916-5e518699231d	8bd567bb-095f-4af3-a994-1976b469c98f
02ba84df-bb65-43e3-8916-5e518699231d	aba6b3a8-f690-4ebf-93ea-7969c1048bab
02ba84df-bb65-43e3-8916-5e518699231d	559b339c-63d4-4a2e-b52a-ae5f82339e2a
02ba84df-bb65-43e3-8916-5e518699231d	2d61209b-c5cf-46df-ae57-7b78ada95c5e
02ba84df-bb65-43e3-8916-5e518699231d	211257fc-0b84-495f-89a9-00adc347a0a5
02ba84df-bb65-43e3-8916-5e518699231d	52045592-803b-4092-a90b-5e1dbfc2894e
02ba84df-bb65-43e3-8916-5e518699231d	20f8ec6c-1e6f-4b5d-a224-c5915582a915
02ba84df-bb65-43e3-8916-5e518699231d	2ba5b48b-7887-47e2-b124-b3df1d37ee05
02ba84df-bb65-43e3-8916-5e518699231d	e29e2482-dcab-495f-8649-c9984ab937da
02ba84df-bb65-43e3-8916-5e518699231d	1952d13a-672e-4fe2-bab2-020fc73c55ba
02ba84df-bb65-43e3-8916-5e518699231d	15288571-f312-40e8-a16c-61041675f9fc
29803f4d-ad19-401d-a525-6f065f7cf98c	2ba5b48b-7887-47e2-b124-b3df1d37ee05
29803f4d-ad19-401d-a525-6f065f7cf98c	15288571-f312-40e8-a16c-61041675f9fc
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	201f6675-d2e5-482e-91bf-4e8fc81860dc
e21ca91f-b8a1-4142-9436-62d6d2d194c2	e29e2482-dcab-495f-8649-c9984ab937da
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	67e864d9-dbb3-4cca-849e-7e09ca4d4882
67e864d9-dbb3-4cca-849e-7e09ca4d4882	e11201ed-f5d0-443f-aeea-de707545c02e
3320b7c0-afb2-4ccb-8241-53373162191d	1902e667-d0c8-43a9-b1fa-723fa0b910d8
02ba84df-bb65-43e3-8916-5e518699231d	49e6ca73-8c62-4015-9858-360b43d66360
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	2e482ccc-26b9-4a76-bc89-74da3337e442
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	e33626fb-9002-4fe5-8d3d-c605db5e53c6
\.


--
-- Data for Name: credential; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credential (id, salt, type, user_id, created_date, user_label, secret_data, credential_data, priority) FROM stdin;
6d407589-3ae5-46eb-a538-d32ed64d63a8	\N	password	44efa4df-2606-46a5-bb4e-c544a2bc79fb	1744882632485	\N	{"value":"6svThi9mSIIKn0zzwUoUldv+3vaULGjYfFGTp7+XWxU=","salt":"hKch60vwe3VPhNaSCPo0OQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
2a281a52-4ab6-4cf1-bde0-fdb9cb44f571	\N	password	bd64c1bc-a586-44f7-b06c-44d8c830cbf3	1744885357545	\N	{"value":"n0nJWDmSo6FEekOUqGrcPSA01no2zW2Lyz5TcwJTFkE=","salt":"FG+zWINGKBbuy2CpgvI0Xg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
16e1ec23-aad9-465b-a188-09f86c374679	\N	password	c28c0880-9125-40dc-83d4-f6fd316f0933	1744963693397	\N	{"value":"ppdzOUVggF4YchdM6fZvAH+uOMOIy5feusAFUlk19iU=","salt":"NgXTeXRe6P8759jjvn0lBQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
7de20de8-ee9c-4213-8546-545be54a2cdd	\N	password	f2d85825-0f39-41bc-9daf-d9dae645d672	1747281919788	\N	{"value":"4D8wVZeu4ZFnQlecbwcVHdJ0bLZrQkBQIibroVEUtgQ=","salt":"1b6ODCfumBsOehGQORqlmQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
2795aa4a-4c1c-44ad-bf4a-daa7dd816154	\N	password	bae6d904-fe73-43cb-b316-5bc3f352f0c5	1747281992723	\N	{"value":"/sfKlEhfR4bk/LczzbX1RLNfACTGBC2er0a2l1seVOI=","salt":"7DOFItL7FzQvyOAykH1/MA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
16797eea-d77a-4250-8b81-855bd5112499	\N	password	ba36d957-8e98-4457-8d99-e393db7d21fe	1747282028053	\N	{"value":"cMCfPupUxEXz7ekd4bQiRy0IegZ2lRVzoCxPWQpNbJI=","salt":"P71SxmpSnOua5nhWaeqzHQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
14b3bc12-665d-4ae3-ae0b-f62b3697b453	\N	password	654c0726-120d-46a2-825b-345682872e49	1747282040931	\N	{"value":"OUJfl1vnjXqeNDpvSsfSL9hGpZNi+/sRalnSTD0XnZk=","salt":"wkyrYstohQOHbngErwjSfQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
89ee5b29-99f2-4613-bcff-54ed6d734fe3	\N	password	b4ce3748-b9a0-48ba-b42c-14721463a681	1747282057986	\N	{"value":"FEJAQH4+JHsxsWU2QA9prCnvZOwp03MaaZD47Sn0mgg=","salt":"8kQE3jawb01t56t3DteuHQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
ce1c52b1-ece7-4f3a-90f0-32703c4a9346	\N	password	312634aa-fe98-4d0e-8c0c-ea81e85a3223	1747282097888	\N	{"value":"2Hf7AfSzga9fMYz0acgTceN+/rra9MYli2e33CPMOeY=","salt":"YPDjypIIjF/1IXwGewxsVA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
2725fe55-3694-42e6-a584-a7c683d9c4a0	\N	password	bebdb6bd-3b84-4f1f-a987-661eda22e1f8	1747282110348	\N	{"value":"Mowb0k72n2IXScKqlcVeWeG3RQB9+ev9+RvTzZKICpg=","salt":"cWsqs7H0P8uHIabZEEL50Q==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
2973deba-ce47-4d46-8f3d-22e20e6eeba3	\N	password	6d9a1706-65e6-433d-b728-197435204704	1747282135848	\N	{"value":"V0x0iSZYeve6t4er2GQauaCZmlSsC8IA+SbXMeFLBlQ=","salt":"34NDy/lrmog84WhFt1nP5w==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
8fea1fbf-8215-4bcf-ab09-95ca8af61b01	\N	password	bd45c3b2-d765-461f-b0f1-239cd96e7df4	1747282153257	\N	{"value":"GTjpefCceZkb+y8njNGfQGnMA8sQnA79m1VwFyT08aE=","salt":"PusLDEhbI9oXG9LYird3ZA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
b561bd95-c400-4674-bf6f-8afaa8d8df7d	\N	password	2ecc4748-968e-48c5-aae2-c58a03196052	1747282179499	\N	{"value":"ZBccGCcLnVfYLGvSLSjQB6aWmPzk6feqUrPmJfUOhoc=","salt":"oy377Now1Kgit/+Jdx8dEQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
a2619b69-9a28-4636-a819-6a9181fd5f66	\N	password	2090aa34-7ec4-488c-9f87-89bf0011870c	1749585124119	\N	{"value":"rrbyLhRP5UitTOcN/hN+SSRQvRaLE6wWFCUtdzk5s7w=","salt":"EMEQuo+b+/xpfKlmndsHeQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
e43dab0f-66e2-4a3b-9598-4a5d0e4f8a37	\N	password	7e264d68-9aca-43fe-a8e9-1bffe3f975c6	1749625837410	\N	{"value":"2F2YuLg8CM5FZnxzjxGExvvIPrB3KaHOG49posmyZdw=","salt":"fhSx4SSY5UpvkRuSm6Ec8w==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
5b339419-c19d-4778-9e69-1b2329677387	\N	password	3e816711-d657-4a2b-9faa-fc35ae9ece96	1750058311939	\N	{"value":"B9WA591o937/UvrmflIo1EOUpKi8sdP+CS419aVW/aM=","salt":"6F2cxoQhVAsGicBo034xAg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
dadf58d7-8437-4552-99af-1857748dcf81	\N	password	97a5c489-7690-4a2e-ac73-6e83bc56a250	1750403130005	\N	{"value":"BcnMoLYF5N4MvH8OfRfyp5P1/+O0MVjXWneKS/rtUaU=","salt":"7NKxP59O4FqlShP3PqoCtQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
60607b1b-106a-4f43-aeb3-9d06f4eba602	\N	password	4783332a-f8cb-4d9e-be8e-cc64c80ee280	1750417602605	\N	{"value":"JCVc9LAmDA7SNbqytzZFLulj6l63PL9usYLsbzciQIE=","salt":"YjEmO8p/Hy3ec+C6cqNbhg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
f2fef664-685c-406c-aff9-700d2da13fa0	\N	password	74acc73d-fdcc-4f28-a86d-5f07b77b4d26	1750863138205	\N	{"value":"8xZW9LP/aHb0PqtQkcPgMWrihHR+VwYTLHB0BN9NSmo=","salt":"U2dIp3PFjyhM3aqJxnnR6Q==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
d4f977ff-9b18-4d6b-b0cc-faecc90bfe77	\N	password	eee1e33c-a926-4fae-a579-ba2392522035	1751370553660	\N	{"value":"A+d+8kpbV9mEbitfSpNqZj8vUIJVcsT7zhBb48u7czU=","salt":"TE7rNzsn45lrlO6vtJZK4w==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
fa9c7980-9cb9-42ea-b63b-70a4b8034861	\N	password	11a6c7a4-dde2-43c1-8d05-22eca6e83a01	1752575260688	\N	{"value":"8L4GpP3jHZl6Bc5b0Ga9oZ8443/W1h0NWQz1FMSd3bs=","salt":"nA3ZzkrflxNQBt2X7idLdw==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
3ebd649c-6a58-45bb-b044-fcba9f761f53	\N	password	2147e070-4e8f-410d-9943-187058862201	1753680765048	\N	{"value":"BFpa33kMNzxcjCzT+tsBKhd269qUvwIsakQ8gFxiYJU=","salt":"JIuY3lS8CBCSzYNTQTurMg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
e6648bf0-abf3-4375-bebe-094af6b54d91	\N	password	28deea38-10e4-4312-9714-ba4e4c8f1e46	1753773267536	\N	{"value":"gHhBGtKYukp6jlDw/CxTNHQmAvPwEs36kqSvVq/lDwo=","salt":"4lDWpyXAM3wD6FkL+v21ww==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
3f64ece2-f0e6-4860-b09a-231756cfbb43	\N	password	ce93c5fd-493e-48de-a338-52c637769d7c	1753775609902	\N	{"value":"j9NLubAgTTa48e9Ou99AAo1eqP/ThK7jSstfTv5EMrs=","salt":"CZo16d0VT7Flj7iBHawiyQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
102df997-d2f1-4e48-8b1f-595dfa5ff314	\N	password	5c0c8446-72f9-43cd-9055-5f763fb61743	1753776372666	\N	{"value":"1RAR9r2HyNmE+O8wRDuYKG9nF2xG2UbE5XPnelJAEek=","salt":"waf17QclVKa1GH/ZuVAvjQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
564d6f3b-bb00-467a-af55-e4da6286cf30	\N	password	1cbc085a-54ce-4ead-95bc-4c3e5ee75572	1753779890469	\N	{"value":"GBblzI4IXEaBsWEtxv6xUDqyJcDf6EVWtYGNSJrPzKE=","salt":"evUS1AvcRAPvHwa4P+4SPg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
f16336cf-015c-4330-aacf-8f0b313f2efe	\N	password	3d430690-7e57-4569-b5a3-c4b7caac4d2c	1753780059409	\N	{"value":"hFCRJQS8BW4NtOiZXd2BThUqWcOa0jg9ReYl2q9yvCY=","salt":"ymw3aj0KxZduTcJo8PwwsA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
8291b006-ba66-4329-aa84-4a0c5c2d06fd	\N	password	aa2cbe36-e41e-432c-8c57-bdce8030dec4	1753783413113	\N	{"value":"gu2FL3w4K4LmtZX8LbdedV9KY4/ishmKwCjioCH3Z3k=","salt":"l2PyP3ju+iUN0ZOkMOStqg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
c8bc2e3e-7576-4073-826b-8d8aae758f84	\N	password	ff94545a-f8af-4139-bd3a-9fe6e9577f20	1753783505025	\N	{"value":"22ZzlKxMYbZxm1DKOfQ/RHQN/YTDg2KM3fM2xnF1F48=","salt":"0jZMv3ZY5RfoqcY19ZKbAg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
911cf080-d928-4513-93c1-d4ce1f57be3c	\N	password	33d5430b-5f2f-489a-9356-f6eb88585466	1753783685599	\N	{"value":"ZIda+xL91mFEfnImKZZm6cqREIalcn/MnzkpAvb4B8M=","salt":"5hQoiQZ4gu8KZOg8N2gRmA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
2e2fec39-fe17-49eb-885e-3b36a9b4deea	\N	password	fedc44a5-d4e2-4627-b7d0-f1dbf0d0f83e	1753783767208	\N	{"value":"tI3AJ2VyInqEpiGus9eHNgEHN9sJXqUJh9b85bxaKGM=","salt":"fSxm9JdWr1C/25kKClBAZA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
18dc3630-7c92-4357-806e-11e95c6ead3f	\N	password	e71c1fd2-6e0d-4eda-9b32-23e09f4df3c7	1753853389471	\N	{"value":"cOMs9ER7OEo3BrcWfnQX8YbTazhjRk8G3yhmJUmHwrY=","salt":"MD0De4JAQjeKeU+A8hp9Rg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
a3e3c2e9-e002-4836-8099-f2f89b0a4130	\N	password	b7d7e43e-d928-43e1-b09a-9fd4cfac1509	1753863227181	\N	{"value":"QEh1krWXOUPq+8gM1wP8METwIIVtaqwMDUGgQzOmdiU=","salt":"ZyuH5IwyBMBeF1u9ycVG6A==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
df91d581-7cc2-4a02-a0c6-1b2a9f9bfc70	\N	password	d38613b2-15fb-4701-abe4-a98ef16da1b3	1756456295784	\N	{"value":"QydNbjddkZvhjzuMRlFcSqnvS1jnawCT/KMCYNaLK6c=","salt":"32QTS64orVO7PrdsComGPQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
89dc96e3-8c1b-454b-8489-0d91edd7933c	\N	password	b82451f7-fdb0-44bd-9991-a4547c197a72	1756794607274	\N	{"value":"5P+dwD9cDpHG6vMqavzucmJvagH7dt3aSITj52So6gU=","salt":"ctxCF9UQ+e/qTnChfIrHMA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
37c8ca9e-615f-4fef-b20c-4e915dc9a1f6	\N	password	9c27715f-688a-4ee8-b41c-18387181f140	1757076732245	\N	{"value":"qZCUMEp2dV3nsO5ltylEiZI+rlkbSdPLl/nXl9EI5hU=","salt":"QJ6En5SPmNIEh2WL0o9OJA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
eec39193-a306-443e-9902-b9d12a61d3fa	\N	password	c5143ee7-d532-43ac-880f-04cdbbb15a35	1759902130475	\N	{"value":"CDt9UOHWleja8BfRvedN2PndRVh9jGQrNm7tdqzLJQw=","salt":"laGNSpXzw/MGFgyfXabQOw==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
0b757c22-85da-4c73-b938-40d45dfe3dfb	\N	password	ae8df46e-4977-4413-aa90-48ee84ca772e	1759475018746	\N	{"value":"8Ou6CQA5EkhCU+NJP+5K1RsOewHhytcrQ96kG3g5aN8=","salt":"oevEo+VyFN9S0D1t1fij9w==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
f05f7f0a-25b6-437b-bd13-8b2036af7ad3	\N	password	4f1e2106-a2d5-4f74-8995-5055f6b8455f	1759491988535	\N	{"value":"2g0chG+XFrYt4hjXxmqyLnPY7zWUu77VLXnnaQRbmpc=","salt":"dbj+gZS7kuyIMrMGZcVHsQ==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
c6977828-a3f8-4f9e-b063-cb611c6e6c54	\N	password	ec9a50a1-750c-47f1-967f-0b4b2afc4772	1759513026381	\N	{"value":"04pSPuH+qlCKZN5V1MDL299Vemi640xdc6iePXPfCco=","salt":"mIAsASxV3wF+3gDe46Z3gg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
d70c7668-a606-419e-a0c7-e8ee5a1cb255	\N	password	eb41ed17-ad46-4edc-93fe-e8b0e2b793a0	1759741679043	\N	{"value":"R9cIN2IE1msaLyVc33aolsVD0X2s7ynWVUEW5wlh5fQ=","salt":"H32UlskghbT7enW8+uZjcA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
99f542ad-0917-4119-b1ca-6b722869197c	\N	password	f39961c0-52b4-4ecd-8d9c-1a67619074de	1759742049712	\N	{"value":"CChgBno0R2abwOhcGptxEHBQrGu6xSQAyN+5ufFCAAM=","salt":"1IGq5nQ6mu2N095T91L35A==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
0d24b449-6862-44fd-814d-dd52a8a90615	\N	password	0d102056-cbc9-4c85-9842-2d1d1e2b6fe1	1759827679776	\N	{"value":"acaMS6rZHoyk1jotDoG1mu3EqBie5zxPutkRGu6lp3k=","salt":"ID0BkGWzF5C9knTIWP+UOg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
6a7a09db-e02e-423f-9b29-40b2c146c7ca	\N	password	afbf9f12-74c8-4dbc-b8f6-0991c6af34eb	1759884875067	\N	{"value":"FBavYRYtnrVrAeAuWADPmdfX2wjw1Xg16Dvn1ZU87FE=","salt":"n6WtNJnkb+V+dEHmUbfjfg==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
2d9182fa-d53b-4f80-9522-2fdddd434e07	\N	password	fa5a86f2-4c8a-4b32-a6b0-1555d7a22e2b	1759900499094	\N	{"value":"HkAiPUc+nSChoK97SfCP/JGTAycc9oLpSVrVVPYmAFI=","salt":"RRB4ssK2ARJfI7K6xRksNA==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
c4cc621b-0837-456c-af00-c5255921b4f0	\N	password	0dc33a1b-b6bc-4ce8-b591-ba58d6fa1ae6	1760006603111	\N	{"value":"Bpq2+YQly+kVxcY8g9l8bbrMjI0iN9Z0bBsQ6srqLnI=","salt":"gvNSDmgxwb/OkThOB95zhw==","additionalParameters":{}}	{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}	10
\.


--
-- Data for Name: databasechangelog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.databasechangelog (id, author, filename, dateexecuted, orderexecuted, exectype, md5sum, description, comments, tag, liquibase, contexts, labels, deployment_id) FROM stdin;
1.0.0.Final-KEYCLOAK-5461	sthorger@redhat.com	META-INF/jpa-changelog-1.0.0.Final.xml	2025-04-17 09:37:04.88417	1	EXECUTED	9:6f1016664e21e16d26517a4418f5e3df	createTable tableName=APPLICATION_DEFAULT_ROLES; createTable tableName=CLIENT; createTable tableName=CLIENT_SESSION; createTable tableName=CLIENT_SESSION_ROLE; createTable tableName=COMPOSITE_ROLE; createTable tableName=CREDENTIAL; createTable tab...		\N	4.29.1	\N	\N	4882624355
1.0.0.Final-KEYCLOAK-5461	sthorger@redhat.com	META-INF/db2-jpa-changelog-1.0.0.Final.xml	2025-04-17 09:37:04.904618	2	MARK_RAN	9:828775b1596a07d1200ba1d49e5e3941	createTable tableName=APPLICATION_DEFAULT_ROLES; createTable tableName=CLIENT; createTable tableName=CLIENT_SESSION; createTable tableName=CLIENT_SESSION_ROLE; createTable tableName=COMPOSITE_ROLE; createTable tableName=CREDENTIAL; createTable tab...		\N	4.29.1	\N	\N	4882624355
1.1.0.Beta1	sthorger@redhat.com	META-INF/jpa-changelog-1.1.0.Beta1.xml	2025-04-17 09:37:04.954436	3	EXECUTED	9:5f090e44a7d595883c1fb61f4b41fd38	delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION; createTable tableName=CLIENT_ATTRIBUTES; createTable tableName=CLIENT_SESSION_NOTE; createTable tableName=APP_NODE_REGISTRATIONS; addColumn table...		\N	4.29.1	\N	\N	4882624355
1.1.0.Final	sthorger@redhat.com	META-INF/jpa-changelog-1.1.0.Final.xml	2025-04-17 09:37:04.957549	4	EXECUTED	9:c07e577387a3d2c04d1adc9aaad8730e	renameColumn newColumnName=EVENT_TIME, oldColumnName=TIME, tableName=EVENT_ENTITY		\N	4.29.1	\N	\N	4882624355
1.2.0.Beta1	psilva@redhat.com	META-INF/jpa-changelog-1.2.0.Beta1.xml	2025-04-17 09:37:05.082778	5	EXECUTED	9:b68ce996c655922dbcd2fe6b6ae72686	delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION; createTable tableName=PROTOCOL_MAPPER; createTable tableName=PROTOCOL_MAPPER_CONFIG; createTable tableName=...		\N	4.29.1	\N	\N	4882624355
1.2.0.Beta1	psilva@redhat.com	META-INF/db2-jpa-changelog-1.2.0.Beta1.xml	2025-04-17 09:37:05.088925	6	MARK_RAN	9:543b5c9989f024fe35c6f6c5a97de88e	delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION; createTable tableName=PROTOCOL_MAPPER; createTable tableName=PROTOCOL_MAPPER_CONFIG; createTable tableName=...		\N	4.29.1	\N	\N	4882624355
1.2.0.RC1	bburke@redhat.com	META-INF/jpa-changelog-1.2.0.CR1.xml	2025-04-17 09:37:05.215615	7	EXECUTED	9:765afebbe21cf5bbca048e632df38336	delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION_NOTE; delete tableName=USER_SESSION; createTable tableName=MIGRATION_MODEL; createTable tableName=IDENTITY_P...		\N	4.29.1	\N	\N	4882624355
1.2.0.RC1	bburke@redhat.com	META-INF/db2-jpa-changelog-1.2.0.CR1.xml	2025-04-17 09:37:05.220779	8	MARK_RAN	9:db4a145ba11a6fdaefb397f6dbf829a1	delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION_NOTE; delete tableName=USER_SESSION; createTable tableName=MIGRATION_MODEL; createTable tableName=IDENTITY_P...		\N	4.29.1	\N	\N	4882624355
1.2.0.Final	keycloak	META-INF/jpa-changelog-1.2.0.Final.xml	2025-04-17 09:37:05.225676	9	EXECUTED	9:9d05c7be10cdb873f8bcb41bc3a8ab23	update tableName=CLIENT; update tableName=CLIENT; update tableName=CLIENT		\N	4.29.1	\N	\N	4882624355
1.3.0	bburke@redhat.com	META-INF/jpa-changelog-1.3.0.xml	2025-04-17 09:37:05.331252	10	EXECUTED	9:18593702353128d53111f9b1ff0b82b8	delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_PROT_MAPPER; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION_NOTE; delete tableName=USER_SESSION; createTable tableName=ADMI...		\N	4.29.1	\N	\N	4882624355
1.4.0	bburke@redhat.com	META-INF/jpa-changelog-1.4.0.xml	2025-04-17 09:37:05.384855	11	EXECUTED	9:6122efe5f090e41a85c0f1c9e52cbb62	delete tableName=CLIENT_SESSION_AUTH_STATUS; delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_PROT_MAPPER; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION_NOTE; delete table...		\N	4.29.1	\N	\N	4882624355
1.4.0	bburke@redhat.com	META-INF/db2-jpa-changelog-1.4.0.xml	2025-04-17 09:37:05.389318	12	MARK_RAN	9:e1ff28bf7568451453f844c5d54bb0b5	delete tableName=CLIENT_SESSION_AUTH_STATUS; delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_PROT_MAPPER; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION_NOTE; delete table...		\N	4.29.1	\N	\N	4882624355
1.5.0	bburke@redhat.com	META-INF/jpa-changelog-1.5.0.xml	2025-04-17 09:37:05.411741	13	EXECUTED	9:7af32cd8957fbc069f796b61217483fd	delete tableName=CLIENT_SESSION_AUTH_STATUS; delete tableName=CLIENT_SESSION_ROLE; delete tableName=CLIENT_SESSION_PROT_MAPPER; delete tableName=CLIENT_SESSION_NOTE; delete tableName=CLIENT_SESSION; delete tableName=USER_SESSION_NOTE; delete table...		\N	4.29.1	\N	\N	4882624355
1.6.1_from15	mposolda@redhat.com	META-INF/jpa-changelog-1.6.1.xml	2025-04-17 09:37:05.432792	14	EXECUTED	9:6005e15e84714cd83226bf7879f54190	addColumn tableName=REALM; addColumn tableName=KEYCLOAK_ROLE; addColumn tableName=CLIENT; createTable tableName=OFFLINE_USER_SESSION; createTable tableName=OFFLINE_CLIENT_SESSION; addPrimaryKey constraintName=CONSTRAINT_OFFL_US_SES_PK2, tableName=...		\N	4.29.1	\N	\N	4882624355
1.6.1_from16-pre	mposolda@redhat.com	META-INF/jpa-changelog-1.6.1.xml	2025-04-17 09:37:05.434204	15	MARK_RAN	9:bf656f5a2b055d07f314431cae76f06c	delete tableName=OFFLINE_CLIENT_SESSION; delete tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
1.6.1_from16	mposolda@redhat.com	META-INF/jpa-changelog-1.6.1.xml	2025-04-17 09:37:05.437056	16	MARK_RAN	9:f8dadc9284440469dcf71e25ca6ab99b	dropPrimaryKey constraintName=CONSTRAINT_OFFLINE_US_SES_PK, tableName=OFFLINE_USER_SESSION; dropPrimaryKey constraintName=CONSTRAINT_OFFLINE_CL_SES_PK, tableName=OFFLINE_CLIENT_SESSION; addColumn tableName=OFFLINE_USER_SESSION; update tableName=OF...		\N	4.29.1	\N	\N	4882624355
1.6.1	mposolda@redhat.com	META-INF/jpa-changelog-1.6.1.xml	2025-04-17 09:37:05.439558	17	EXECUTED	9:d41d8cd98f00b204e9800998ecf8427e	empty		\N	4.29.1	\N	\N	4882624355
1.7.0	bburke@redhat.com	META-INF/jpa-changelog-1.7.0.xml	2025-04-17 09:37:05.502869	18	EXECUTED	9:3368ff0be4c2855ee2dd9ca813b38d8e	createTable tableName=KEYCLOAK_GROUP; createTable tableName=GROUP_ROLE_MAPPING; createTable tableName=GROUP_ATTRIBUTE; createTable tableName=USER_GROUP_MEMBERSHIP; createTable tableName=REALM_DEFAULT_GROUPS; addColumn tableName=IDENTITY_PROVIDER; ...		\N	4.29.1	\N	\N	4882624355
1.8.0	mposolda@redhat.com	META-INF/jpa-changelog-1.8.0.xml	2025-04-17 09:37:05.561527	19	EXECUTED	9:8ac2fb5dd030b24c0570a763ed75ed20	addColumn tableName=IDENTITY_PROVIDER; createTable tableName=CLIENT_TEMPLATE; createTable tableName=CLIENT_TEMPLATE_ATTRIBUTES; createTable tableName=TEMPLATE_SCOPE_MAPPING; dropNotNullConstraint columnName=CLIENT_ID, tableName=PROTOCOL_MAPPER; ad...		\N	4.29.1	\N	\N	4882624355
1.8.0-2	keycloak	META-INF/jpa-changelog-1.8.0.xml	2025-04-17 09:37:05.566508	20	EXECUTED	9:f91ddca9b19743db60e3057679810e6c	dropDefaultValue columnName=ALGORITHM, tableName=CREDENTIAL; update tableName=CREDENTIAL		\N	4.29.1	\N	\N	4882624355
26.0.0-33201-org-redirect-url	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.255754	144	EXECUTED	9:4d0e22b0ac68ebe9794fa9cb752ea660	addColumn tableName=ORG		\N	4.29.1	\N	\N	4882624355
1.8.0	mposolda@redhat.com	META-INF/db2-jpa-changelog-1.8.0.xml	2025-04-17 09:37:05.569589	21	MARK_RAN	9:831e82914316dc8a57dc09d755f23c51	addColumn tableName=IDENTITY_PROVIDER; createTable tableName=CLIENT_TEMPLATE; createTable tableName=CLIENT_TEMPLATE_ATTRIBUTES; createTable tableName=TEMPLATE_SCOPE_MAPPING; dropNotNullConstraint columnName=CLIENT_ID, tableName=PROTOCOL_MAPPER; ad...		\N	4.29.1	\N	\N	4882624355
1.8.0-2	keycloak	META-INF/db2-jpa-changelog-1.8.0.xml	2025-04-17 09:37:05.571621	22	MARK_RAN	9:f91ddca9b19743db60e3057679810e6c	dropDefaultValue columnName=ALGORITHM, tableName=CREDENTIAL; update tableName=CREDENTIAL		\N	4.29.1	\N	\N	4882624355
1.9.0	mposolda@redhat.com	META-INF/jpa-changelog-1.9.0.xml	2025-04-17 09:37:05.69573	23	EXECUTED	9:bc3d0f9e823a69dc21e23e94c7a94bb1	update tableName=REALM; update tableName=REALM; update tableName=REALM; update tableName=REALM; update tableName=CREDENTIAL; update tableName=CREDENTIAL; update tableName=CREDENTIAL; update tableName=REALM; update tableName=REALM; customChange; dr...		\N	4.29.1	\N	\N	4882624355
1.9.1	keycloak	META-INF/jpa-changelog-1.9.1.xml	2025-04-17 09:37:05.702455	24	EXECUTED	9:c9999da42f543575ab790e76439a2679	modifyDataType columnName=PRIVATE_KEY, tableName=REALM; modifyDataType columnName=PUBLIC_KEY, tableName=REALM; modifyDataType columnName=CERTIFICATE, tableName=REALM		\N	4.29.1	\N	\N	4882624355
1.9.1	keycloak	META-INF/db2-jpa-changelog-1.9.1.xml	2025-04-17 09:37:05.703583	25	MARK_RAN	9:0d6c65c6f58732d81569e77b10ba301d	modifyDataType columnName=PRIVATE_KEY, tableName=REALM; modifyDataType columnName=CERTIFICATE, tableName=REALM		\N	4.29.1	\N	\N	4882624355
1.9.2	keycloak	META-INF/jpa-changelog-1.9.2.xml	2025-04-17 09:37:06.108745	26	EXECUTED	9:fc576660fc016ae53d2d4778d84d86d0	createIndex indexName=IDX_USER_EMAIL, tableName=USER_ENTITY; createIndex indexName=IDX_USER_ROLE_MAPPING, tableName=USER_ROLE_MAPPING; createIndex indexName=IDX_USER_GROUP_MAPPING, tableName=USER_GROUP_MEMBERSHIP; createIndex indexName=IDX_USER_CO...		\N	4.29.1	\N	\N	4882624355
authz-2.0.0	psilva@redhat.com	META-INF/jpa-changelog-authz-2.0.0.xml	2025-04-17 09:37:06.188297	27	EXECUTED	9:43ed6b0da89ff77206289e87eaa9c024	createTable tableName=RESOURCE_SERVER; addPrimaryKey constraintName=CONSTRAINT_FARS, tableName=RESOURCE_SERVER; addUniqueConstraint constraintName=UK_AU8TT6T700S9V50BU18WS5HA6, tableName=RESOURCE_SERVER; createTable tableName=RESOURCE_SERVER_RESOU...		\N	4.29.1	\N	\N	4882624355
authz-2.5.1	psilva@redhat.com	META-INF/jpa-changelog-authz-2.5.1.xml	2025-04-17 09:37:06.193016	28	EXECUTED	9:44bae577f551b3738740281eceb4ea70	update tableName=RESOURCE_SERVER_POLICY		\N	4.29.1	\N	\N	4882624355
2.1.0-KEYCLOAK-5461	bburke@redhat.com	META-INF/jpa-changelog-2.1.0.xml	2025-04-17 09:37:06.251056	29	EXECUTED	9:bd88e1f833df0420b01e114533aee5e8	createTable tableName=BROKER_LINK; createTable tableName=FED_USER_ATTRIBUTE; createTable tableName=FED_USER_CONSENT; createTable tableName=FED_USER_CONSENT_ROLE; createTable tableName=FED_USER_CONSENT_PROT_MAPPER; createTable tableName=FED_USER_CR...		\N	4.29.1	\N	\N	4882624355
2.2.0	bburke@redhat.com	META-INF/jpa-changelog-2.2.0.xml	2025-04-17 09:37:06.266922	30	EXECUTED	9:a7022af5267f019d020edfe316ef4371	addColumn tableName=ADMIN_EVENT_ENTITY; createTable tableName=CREDENTIAL_ATTRIBUTE; createTable tableName=FED_CREDENTIAL_ATTRIBUTE; modifyDataType columnName=VALUE, tableName=CREDENTIAL; addForeignKeyConstraint baseTableName=FED_CREDENTIAL_ATTRIBU...		\N	4.29.1	\N	\N	4882624355
2.3.0	bburke@redhat.com	META-INF/jpa-changelog-2.3.0.xml	2025-04-17 09:37:06.286297	31	EXECUTED	9:fc155c394040654d6a79227e56f5e25a	createTable tableName=FEDERATED_USER; addPrimaryKey constraintName=CONSTR_FEDERATED_USER, tableName=FEDERATED_USER; dropDefaultValue columnName=TOTP, tableName=USER_ENTITY; dropColumn columnName=TOTP, tableName=USER_ENTITY; addColumn tableName=IDE...		\N	4.29.1	\N	\N	4882624355
2.4.0	bburke@redhat.com	META-INF/jpa-changelog-2.4.0.xml	2025-04-17 09:37:06.293862	32	EXECUTED	9:eac4ffb2a14795e5dc7b426063e54d88	customChange		\N	4.29.1	\N	\N	4882624355
2.5.0	bburke@redhat.com	META-INF/jpa-changelog-2.5.0.xml	2025-04-17 09:37:06.301221	33	EXECUTED	9:54937c05672568c4c64fc9524c1e9462	customChange; modifyDataType columnName=USER_ID, tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
2.5.0-unicode-oracle	hmlnarik@redhat.com	META-INF/jpa-changelog-2.5.0.xml	2025-04-17 09:37:06.303467	34	MARK_RAN	9:3a32bace77c84d7678d035a7f5a8084e	modifyDataType columnName=DESCRIPTION, tableName=AUTHENTICATION_FLOW; modifyDataType columnName=DESCRIPTION, tableName=CLIENT_TEMPLATE; modifyDataType columnName=DESCRIPTION, tableName=RESOURCE_SERVER_POLICY; modifyDataType columnName=DESCRIPTION,...		\N	4.29.1	\N	\N	4882624355
2.5.0-unicode-other-dbs	hmlnarik@redhat.com	META-INF/jpa-changelog-2.5.0.xml	2025-04-17 09:37:06.330172	35	EXECUTED	9:33d72168746f81f98ae3a1e8e0ca3554	modifyDataType columnName=DESCRIPTION, tableName=AUTHENTICATION_FLOW; modifyDataType columnName=DESCRIPTION, tableName=CLIENT_TEMPLATE; modifyDataType columnName=DESCRIPTION, tableName=RESOURCE_SERVER_POLICY; modifyDataType columnName=DESCRIPTION,...		\N	4.29.1	\N	\N	4882624355
2.5.0-duplicate-email-support	slawomir@dabek.name	META-INF/jpa-changelog-2.5.0.xml	2025-04-17 09:37:06.334749	36	EXECUTED	9:61b6d3d7a4c0e0024b0c839da283da0c	addColumn tableName=REALM		\N	4.29.1	\N	\N	4882624355
2.5.0-unique-group-names	hmlnarik@redhat.com	META-INF/jpa-changelog-2.5.0.xml	2025-04-17 09:37:06.338659	37	EXECUTED	9:8dcac7bdf7378e7d823cdfddebf72fda	addUniqueConstraint constraintName=SIBLING_NAMES, tableName=KEYCLOAK_GROUP		\N	4.29.1	\N	\N	4882624355
2.5.1	bburke@redhat.com	META-INF/jpa-changelog-2.5.1.xml	2025-04-17 09:37:06.341339	38	EXECUTED	9:a2b870802540cb3faa72098db5388af3	addColumn tableName=FED_USER_CONSENT		\N	4.29.1	\N	\N	4882624355
3.0.0	bburke@redhat.com	META-INF/jpa-changelog-3.0.0.xml	2025-04-17 09:37:06.343851	39	EXECUTED	9:132a67499ba24bcc54fb5cbdcfe7e4c0	addColumn tableName=IDENTITY_PROVIDER		\N	4.29.1	\N	\N	4882624355
3.2.0-fix	keycloak	META-INF/jpa-changelog-3.2.0.xml	2025-04-17 09:37:06.344658	40	MARK_RAN	9:938f894c032f5430f2b0fafb1a243462	addNotNullConstraint columnName=REALM_ID, tableName=CLIENT_INITIAL_ACCESS		\N	4.29.1	\N	\N	4882624355
3.2.0-fix-with-keycloak-5416	keycloak	META-INF/jpa-changelog-3.2.0.xml	2025-04-17 09:37:06.34598	41	MARK_RAN	9:845c332ff1874dc5d35974b0babf3006	dropIndex indexName=IDX_CLIENT_INIT_ACC_REALM, tableName=CLIENT_INITIAL_ACCESS; addNotNullConstraint columnName=REALM_ID, tableName=CLIENT_INITIAL_ACCESS; createIndex indexName=IDX_CLIENT_INIT_ACC_REALM, tableName=CLIENT_INITIAL_ACCESS		\N	4.29.1	\N	\N	4882624355
3.2.0-fix-offline-sessions	hmlnarik	META-INF/jpa-changelog-3.2.0.xml	2025-04-17 09:37:06.350247	42	EXECUTED	9:fc86359c079781adc577c5a217e4d04c	customChange		\N	4.29.1	\N	\N	4882624355
3.2.0-fixed	keycloak	META-INF/jpa-changelog-3.2.0.xml	2025-04-17 09:37:07.837691	43	EXECUTED	9:59a64800e3c0d09b825f8a3b444fa8f4	addColumn tableName=REALM; dropPrimaryKey constraintName=CONSTRAINT_OFFL_CL_SES_PK2, tableName=OFFLINE_CLIENT_SESSION; dropColumn columnName=CLIENT_SESSION_ID, tableName=OFFLINE_CLIENT_SESSION; addPrimaryKey constraintName=CONSTRAINT_OFFL_CL_SES_P...		\N	4.29.1	\N	\N	4882624355
3.3.0	keycloak	META-INF/jpa-changelog-3.3.0.xml	2025-04-17 09:37:07.84244	44	EXECUTED	9:d48d6da5c6ccf667807f633fe489ce88	addColumn tableName=USER_ENTITY		\N	4.29.1	\N	\N	4882624355
authz-3.4.0.CR1-resource-server-pk-change-part1	glavoie@gmail.com	META-INF/jpa-changelog-authz-3.4.0.CR1.xml	2025-04-17 09:37:07.848681	45	EXECUTED	9:dde36f7973e80d71fceee683bc5d2951	addColumn tableName=RESOURCE_SERVER_POLICY; addColumn tableName=RESOURCE_SERVER_RESOURCE; addColumn tableName=RESOURCE_SERVER_SCOPE		\N	4.29.1	\N	\N	4882624355
authz-3.4.0.CR1-resource-server-pk-change-part2-KEYCLOAK-6095	hmlnarik@redhat.com	META-INF/jpa-changelog-authz-3.4.0.CR1.xml	2025-04-17 09:37:07.855578	46	EXECUTED	9:b855e9b0a406b34fa323235a0cf4f640	customChange		\N	4.29.1	\N	\N	4882624355
authz-3.4.0.CR1-resource-server-pk-change-part3-fixed	glavoie@gmail.com	META-INF/jpa-changelog-authz-3.4.0.CR1.xml	2025-04-17 09:37:07.857495	47	MARK_RAN	9:51abbacd7b416c50c4421a8cabf7927e	dropIndex indexName=IDX_RES_SERV_POL_RES_SERV, tableName=RESOURCE_SERVER_POLICY; dropIndex indexName=IDX_RES_SRV_RES_RES_SRV, tableName=RESOURCE_SERVER_RESOURCE; dropIndex indexName=IDX_RES_SRV_SCOPE_RES_SRV, tableName=RESOURCE_SERVER_SCOPE		\N	4.29.1	\N	\N	4882624355
authz-3.4.0.CR1-resource-server-pk-change-part3-fixed-nodropindex	glavoie@gmail.com	META-INF/jpa-changelog-authz-3.4.0.CR1.xml	2025-04-17 09:37:07.996671	48	EXECUTED	9:bdc99e567b3398bac83263d375aad143	addNotNullConstraint columnName=RESOURCE_SERVER_CLIENT_ID, tableName=RESOURCE_SERVER_POLICY; addNotNullConstraint columnName=RESOURCE_SERVER_CLIENT_ID, tableName=RESOURCE_SERVER_RESOURCE; addNotNullConstraint columnName=RESOURCE_SERVER_CLIENT_ID, ...		\N	4.29.1	\N	\N	4882624355
authn-3.4.0.CR1-refresh-token-max-reuse	glavoie@gmail.com	META-INF/jpa-changelog-authz-3.4.0.CR1.xml	2025-04-17 09:37:07.999712	49	EXECUTED	9:d198654156881c46bfba39abd7769e69	addColumn tableName=REALM		\N	4.29.1	\N	\N	4882624355
3.4.0	keycloak	META-INF/jpa-changelog-3.4.0.xml	2025-04-17 09:37:08.037438	50	EXECUTED	9:cfdd8736332ccdd72c5256ccb42335db	addPrimaryKey constraintName=CONSTRAINT_REALM_DEFAULT_ROLES, tableName=REALM_DEFAULT_ROLES; addPrimaryKey constraintName=CONSTRAINT_COMPOSITE_ROLE, tableName=COMPOSITE_ROLE; addPrimaryKey constraintName=CONSTR_REALM_DEFAULT_GROUPS, tableName=REALM...		\N	4.29.1	\N	\N	4882624355
3.4.0-KEYCLOAK-5230	hmlnarik@redhat.com	META-INF/jpa-changelog-3.4.0.xml	2025-04-17 09:37:08.370369	51	EXECUTED	9:7c84de3d9bd84d7f077607c1a4dcb714	createIndex indexName=IDX_FU_ATTRIBUTE, tableName=FED_USER_ATTRIBUTE; createIndex indexName=IDX_FU_CONSENT, tableName=FED_USER_CONSENT; createIndex indexName=IDX_FU_CONSENT_RU, tableName=FED_USER_CONSENT; createIndex indexName=IDX_FU_CREDENTIAL, t...		\N	4.29.1	\N	\N	4882624355
3.4.1	psilva@redhat.com	META-INF/jpa-changelog-3.4.1.xml	2025-04-17 09:37:08.372973	52	EXECUTED	9:5a6bb36cbefb6a9d6928452c0852af2d	modifyDataType columnName=VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
3.4.2	keycloak	META-INF/jpa-changelog-3.4.2.xml	2025-04-17 09:37:08.375452	53	EXECUTED	9:8f23e334dbc59f82e0a328373ca6ced0	update tableName=REALM		\N	4.29.1	\N	\N	4882624355
3.4.2-KEYCLOAK-5172	mkanis@redhat.com	META-INF/jpa-changelog-3.4.2.xml	2025-04-17 09:37:08.377759	54	EXECUTED	9:9156214268f09d970cdf0e1564d866af	update tableName=CLIENT		\N	4.29.1	\N	\N	4882624355
4.0.0-KEYCLOAK-6335	bburke@redhat.com	META-INF/jpa-changelog-4.0.0.xml	2025-04-17 09:37:08.383191	55	EXECUTED	9:db806613b1ed154826c02610b7dbdf74	createTable tableName=CLIENT_AUTH_FLOW_BINDINGS; addPrimaryKey constraintName=C_CLI_FLOW_BIND, tableName=CLIENT_AUTH_FLOW_BINDINGS		\N	4.29.1	\N	\N	4882624355
4.0.0-CLEANUP-UNUSED-TABLE	bburke@redhat.com	META-INF/jpa-changelog-4.0.0.xml	2025-04-17 09:37:08.391134	56	EXECUTED	9:229a041fb72d5beac76bb94a5fa709de	dropTable tableName=CLIENT_IDENTITY_PROV_MAPPING		\N	4.29.1	\N	\N	4882624355
4.0.0-KEYCLOAK-6228	bburke@redhat.com	META-INF/jpa-changelog-4.0.0.xml	2025-04-17 09:37:08.44215	57	EXECUTED	9:079899dade9c1e683f26b2aa9ca6ff04	dropUniqueConstraint constraintName=UK_JKUWUVD56ONTGSUHOGM8UEWRT, tableName=USER_CONSENT; dropNotNullConstraint columnName=CLIENT_ID, tableName=USER_CONSENT; addColumn tableName=USER_CONSENT; addUniqueConstraint constraintName=UK_JKUWUVD56ONTGSUHO...		\N	4.29.1	\N	\N	4882624355
4.0.0-KEYCLOAK-5579-fixed	mposolda@redhat.com	META-INF/jpa-changelog-4.0.0.xml	2025-04-17 09:37:08.820694	58	EXECUTED	9:139b79bcbbfe903bb1c2d2a4dbf001d9	dropForeignKeyConstraint baseTableName=CLIENT_TEMPLATE_ATTRIBUTES, constraintName=FK_CL_TEMPL_ATTR_TEMPL; renameTable newTableName=CLIENT_SCOPE_ATTRIBUTES, oldTableName=CLIENT_TEMPLATE_ATTRIBUTES; renameColumn newColumnName=SCOPE_ID, oldColumnName...		\N	4.29.1	\N	\N	4882624355
authz-4.0.0.CR1	psilva@redhat.com	META-INF/jpa-changelog-authz-4.0.0.CR1.xml	2025-04-17 09:37:08.845123	59	EXECUTED	9:b55738ad889860c625ba2bf483495a04	createTable tableName=RESOURCE_SERVER_PERM_TICKET; addPrimaryKey constraintName=CONSTRAINT_FAPMT, tableName=RESOURCE_SERVER_PERM_TICKET; addForeignKeyConstraint baseTableName=RESOURCE_SERVER_PERM_TICKET, constraintName=FK_FRSRHO213XCX4WNKOG82SSPMT...		\N	4.29.1	\N	\N	4882624355
authz-4.0.0.Beta3	psilva@redhat.com	META-INF/jpa-changelog-authz-4.0.0.Beta3.xml	2025-04-17 09:37:08.849936	60	EXECUTED	9:e0057eac39aa8fc8e09ac6cfa4ae15fe	addColumn tableName=RESOURCE_SERVER_POLICY; addColumn tableName=RESOURCE_SERVER_PERM_TICKET; addForeignKeyConstraint baseTableName=RESOURCE_SERVER_PERM_TICKET, constraintName=FK_FRSRPO2128CX4WNKOG82SSRFY, referencedTableName=RESOURCE_SERVER_POLICY		\N	4.29.1	\N	\N	4882624355
authz-4.2.0.Final	mhajas@redhat.com	META-INF/jpa-changelog-authz-4.2.0.Final.xml	2025-04-17 09:37:08.857282	61	EXECUTED	9:42a33806f3a0443fe0e7feeec821326c	createTable tableName=RESOURCE_URIS; addForeignKeyConstraint baseTableName=RESOURCE_URIS, constraintName=FK_RESOURCE_SERVER_URIS, referencedTableName=RESOURCE_SERVER_RESOURCE; customChange; dropColumn columnName=URI, tableName=RESOURCE_SERVER_RESO...		\N	4.29.1	\N	\N	4882624355
authz-4.2.0.Final-KEYCLOAK-9944	hmlnarik@redhat.com	META-INF/jpa-changelog-authz-4.2.0.Final.xml	2025-04-17 09:37:08.860512	62	EXECUTED	9:9968206fca46eecc1f51db9c024bfe56	addPrimaryKey constraintName=CONSTRAINT_RESOUR_URIS_PK, tableName=RESOURCE_URIS		\N	4.29.1	\N	\N	4882624355
4.2.0-KEYCLOAK-6313	wadahiro@gmail.com	META-INF/jpa-changelog-4.2.0.xml	2025-04-17 09:37:08.862496	63	EXECUTED	9:92143a6daea0a3f3b8f598c97ce55c3d	addColumn tableName=REQUIRED_ACTION_PROVIDER		\N	4.29.1	\N	\N	4882624355
4.3.0-KEYCLOAK-7984	wadahiro@gmail.com	META-INF/jpa-changelog-4.3.0.xml	2025-04-17 09:37:08.864501	64	EXECUTED	9:82bab26a27195d889fb0429003b18f40	update tableName=REQUIRED_ACTION_PROVIDER		\N	4.29.1	\N	\N	4882624355
4.6.0-KEYCLOAK-7950	psilva@redhat.com	META-INF/jpa-changelog-4.6.0.xml	2025-04-17 09:37:08.866489	65	EXECUTED	9:e590c88ddc0b38b0ae4249bbfcb5abc3	update tableName=RESOURCE_SERVER_RESOURCE		\N	4.29.1	\N	\N	4882624355
4.6.0-KEYCLOAK-8377	keycloak	META-INF/jpa-changelog-4.6.0.xml	2025-04-17 09:37:08.902155	66	EXECUTED	9:5c1f475536118dbdc38d5d7977950cc0	createTable tableName=ROLE_ATTRIBUTE; addPrimaryKey constraintName=CONSTRAINT_ROLE_ATTRIBUTE_PK, tableName=ROLE_ATTRIBUTE; addForeignKeyConstraint baseTableName=ROLE_ATTRIBUTE, constraintName=FK_ROLE_ATTRIBUTE_ID, referencedTableName=KEYCLOAK_ROLE...		\N	4.29.1	\N	\N	4882624355
4.6.0-KEYCLOAK-8555	gideonray@gmail.com	META-INF/jpa-changelog-4.6.0.xml	2025-04-17 09:37:08.934417	67	EXECUTED	9:e7c9f5f9c4d67ccbbcc215440c718a17	createIndex indexName=IDX_COMPONENT_PROVIDER_TYPE, tableName=COMPONENT		\N	4.29.1	\N	\N	4882624355
4.7.0-KEYCLOAK-1267	sguilhen@redhat.com	META-INF/jpa-changelog-4.7.0.xml	2025-04-17 09:37:08.938469	68	EXECUTED	9:88e0bfdda924690d6f4e430c53447dd5	addColumn tableName=REALM		\N	4.29.1	\N	\N	4882624355
4.7.0-KEYCLOAK-7275	keycloak	META-INF/jpa-changelog-4.7.0.xml	2025-04-17 09:37:08.976685	69	EXECUTED	9:f53177f137e1c46b6a88c59ec1cb5218	renameColumn newColumnName=CREATED_ON, oldColumnName=LAST_SESSION_REFRESH, tableName=OFFLINE_USER_SESSION; addNotNullConstraint columnName=CREATED_ON, tableName=OFFLINE_USER_SESSION; addColumn tableName=OFFLINE_USER_SESSION; customChange; createIn...		\N	4.29.1	\N	\N	4882624355
4.8.0-KEYCLOAK-8835	sguilhen@redhat.com	META-INF/jpa-changelog-4.8.0.xml	2025-04-17 09:37:08.980601	70	EXECUTED	9:a74d33da4dc42a37ec27121580d1459f	addNotNullConstraint columnName=SSO_MAX_LIFESPAN_REMEMBER_ME, tableName=REALM; addNotNullConstraint columnName=SSO_IDLE_TIMEOUT_REMEMBER_ME, tableName=REALM		\N	4.29.1	\N	\N	4882624355
authz-7.0.0-KEYCLOAK-10443	psilva@redhat.com	META-INF/jpa-changelog-authz-7.0.0.xml	2025-04-17 09:37:08.984088	71	EXECUTED	9:fd4ade7b90c3b67fae0bfcfcb42dfb5f	addColumn tableName=RESOURCE_SERVER		\N	4.29.1	\N	\N	4882624355
8.0.0-adding-credential-columns	keycloak	META-INF/jpa-changelog-8.0.0.xml	2025-04-17 09:37:08.989804	72	EXECUTED	9:aa072ad090bbba210d8f18781b8cebf4	addColumn tableName=CREDENTIAL; addColumn tableName=FED_USER_CREDENTIAL		\N	4.29.1	\N	\N	4882624355
8.0.0-updating-credential-data-not-oracle-fixed	keycloak	META-INF/jpa-changelog-8.0.0.xml	2025-04-17 09:37:08.996654	73	EXECUTED	9:1ae6be29bab7c2aa376f6983b932be37	update tableName=CREDENTIAL; update tableName=CREDENTIAL; update tableName=CREDENTIAL; update tableName=FED_USER_CREDENTIAL; update tableName=FED_USER_CREDENTIAL; update tableName=FED_USER_CREDENTIAL		\N	4.29.1	\N	\N	4882624355
8.0.0-updating-credential-data-oracle-fixed	keycloak	META-INF/jpa-changelog-8.0.0.xml	2025-04-17 09:37:08.998426	74	MARK_RAN	9:14706f286953fc9a25286dbd8fb30d97	update tableName=CREDENTIAL; update tableName=CREDENTIAL; update tableName=CREDENTIAL; update tableName=FED_USER_CREDENTIAL; update tableName=FED_USER_CREDENTIAL; update tableName=FED_USER_CREDENTIAL		\N	4.29.1	\N	\N	4882624355
8.0.0-credential-cleanup-fixed	keycloak	META-INF/jpa-changelog-8.0.0.xml	2025-04-17 09:37:09.023106	75	EXECUTED	9:2b9cc12779be32c5b40e2e67711a218b	dropDefaultValue columnName=COUNTER, tableName=CREDENTIAL; dropDefaultValue columnName=DIGITS, tableName=CREDENTIAL; dropDefaultValue columnName=PERIOD, tableName=CREDENTIAL; dropDefaultValue columnName=ALGORITHM, tableName=CREDENTIAL; dropColumn ...		\N	4.29.1	\N	\N	4882624355
8.0.0-resource-tag-support	keycloak	META-INF/jpa-changelog-8.0.0.xml	2025-04-17 09:37:09.059526	76	EXECUTED	9:91fa186ce7a5af127a2d7a91ee083cc5	addColumn tableName=MIGRATION_MODEL; createIndex indexName=IDX_UPDATE_TIME, tableName=MIGRATION_MODEL		\N	4.29.1	\N	\N	4882624355
9.0.0-always-display-client	keycloak	META-INF/jpa-changelog-9.0.0.xml	2025-04-17 09:37:09.062585	77	EXECUTED	9:6335e5c94e83a2639ccd68dd24e2e5ad	addColumn tableName=CLIENT		\N	4.29.1	\N	\N	4882624355
9.0.0-drop-constraints-for-column-increase	keycloak	META-INF/jpa-changelog-9.0.0.xml	2025-04-17 09:37:09.063602	78	MARK_RAN	9:6bdb5658951e028bfe16fa0a8228b530	dropUniqueConstraint constraintName=UK_FRSR6T700S9V50BU18WS5PMT, tableName=RESOURCE_SERVER_PERM_TICKET; dropUniqueConstraint constraintName=UK_FRSR6T700S9V50BU18WS5HA6, tableName=RESOURCE_SERVER_RESOURCE; dropPrimaryKey constraintName=CONSTRAINT_O...		\N	4.29.1	\N	\N	4882624355
9.0.0-increase-column-size-federated-fk	keycloak	META-INF/jpa-changelog-9.0.0.xml	2025-04-17 09:37:09.086908	79	EXECUTED	9:d5bc15a64117ccad481ce8792d4c608f	modifyDataType columnName=CLIENT_ID, tableName=FED_USER_CONSENT; modifyDataType columnName=CLIENT_REALM_CONSTRAINT, tableName=KEYCLOAK_ROLE; modifyDataType columnName=OWNER, tableName=RESOURCE_SERVER_POLICY; modifyDataType columnName=CLIENT_ID, ta...		\N	4.29.1	\N	\N	4882624355
9.0.0-recreate-constraints-after-column-increase	keycloak	META-INF/jpa-changelog-9.0.0.xml	2025-04-17 09:37:09.088523	80	MARK_RAN	9:077cba51999515f4d3e7ad5619ab592c	addNotNullConstraint columnName=CLIENT_ID, tableName=OFFLINE_CLIENT_SESSION; addNotNullConstraint columnName=OWNER, tableName=RESOURCE_SERVER_PERM_TICKET; addNotNullConstraint columnName=REQUESTER, tableName=RESOURCE_SERVER_PERM_TICKET; addNotNull...		\N	4.29.1	\N	\N	4882624355
9.0.1-add-index-to-client.client_id	keycloak	META-INF/jpa-changelog-9.0.1.xml	2025-04-17 09:37:09.121918	81	EXECUTED	9:be969f08a163bf47c6b9e9ead8ac2afb	createIndex indexName=IDX_CLIENT_ID, tableName=CLIENT		\N	4.29.1	\N	\N	4882624355
9.0.1-KEYCLOAK-12579-drop-constraints	keycloak	META-INF/jpa-changelog-9.0.1.xml	2025-04-17 09:37:09.122965	82	MARK_RAN	9:6d3bb4408ba5a72f39bd8a0b301ec6e3	dropUniqueConstraint constraintName=SIBLING_NAMES, tableName=KEYCLOAK_GROUP		\N	4.29.1	\N	\N	4882624355
9.0.1-KEYCLOAK-12579-add-not-null-constraint	keycloak	META-INF/jpa-changelog-9.0.1.xml	2025-04-17 09:37:09.126226	83	EXECUTED	9:966bda61e46bebf3cc39518fbed52fa7	addNotNullConstraint columnName=PARENT_GROUP, tableName=KEYCLOAK_GROUP		\N	4.29.1	\N	\N	4882624355
9.0.1-KEYCLOAK-12579-recreate-constraints	keycloak	META-INF/jpa-changelog-9.0.1.xml	2025-04-17 09:37:09.127091	84	MARK_RAN	9:8dcac7bdf7378e7d823cdfddebf72fda	addUniqueConstraint constraintName=SIBLING_NAMES, tableName=KEYCLOAK_GROUP		\N	4.29.1	\N	\N	4882624355
9.0.1-add-index-to-events	keycloak	META-INF/jpa-changelog-9.0.1.xml	2025-04-17 09:37:09.162217	85	EXECUTED	9:7d93d602352a30c0c317e6a609b56599	createIndex indexName=IDX_EVENT_TIME, tableName=EVENT_ENTITY		\N	4.29.1	\N	\N	4882624355
map-remove-ri	keycloak	META-INF/jpa-changelog-11.0.0.xml	2025-04-17 09:37:09.167598	86	EXECUTED	9:71c5969e6cdd8d7b6f47cebc86d37627	dropForeignKeyConstraint baseTableName=REALM, constraintName=FK_TRAF444KK6QRKMS7N56AIWQ5Y; dropForeignKeyConstraint baseTableName=KEYCLOAK_ROLE, constraintName=FK_KJHO5LE2C0RAL09FL8CM9WFW9		\N	4.29.1	\N	\N	4882624355
map-remove-ri	keycloak	META-INF/jpa-changelog-12.0.0.xml	2025-04-17 09:37:09.178739	87	EXECUTED	9:a9ba7d47f065f041b7da856a81762021	dropForeignKeyConstraint baseTableName=REALM_DEFAULT_GROUPS, constraintName=FK_DEF_GROUPS_GROUP; dropForeignKeyConstraint baseTableName=REALM_DEFAULT_ROLES, constraintName=FK_H4WPD7W4HSOOLNI3H0SW7BTJE; dropForeignKeyConstraint baseTableName=CLIENT...		\N	4.29.1	\N	\N	4882624355
12.1.0-add-realm-localization-table	keycloak	META-INF/jpa-changelog-12.0.0.xml	2025-04-17 09:37:09.186236	88	EXECUTED	9:fffabce2bc01e1a8f5110d5278500065	createTable tableName=REALM_LOCALIZATIONS; addPrimaryKey tableName=REALM_LOCALIZATIONS		\N	4.29.1	\N	\N	4882624355
default-roles	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.191238	89	EXECUTED	9:fa8a5b5445e3857f4b010bafb5009957	addColumn tableName=REALM; customChange		\N	4.29.1	\N	\N	4882624355
default-roles-cleanup	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.201477	90	EXECUTED	9:67ac3241df9a8582d591c5ed87125f39	dropTable tableName=REALM_DEFAULT_ROLES; dropTable tableName=CLIENT_DEFAULT_ROLES		\N	4.29.1	\N	\N	4882624355
13.0.0-KEYCLOAK-16844	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.242105	91	EXECUTED	9:ad1194d66c937e3ffc82386c050ba089	createIndex indexName=IDX_OFFLINE_USS_PRELOAD, tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
map-remove-ri-13.0.0	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.254913	92	EXECUTED	9:d9be619d94af5a2f5d07b9f003543b91	dropForeignKeyConstraint baseTableName=DEFAULT_CLIENT_SCOPE, constraintName=FK_R_DEF_CLI_SCOPE_SCOPE; dropForeignKeyConstraint baseTableName=CLIENT_SCOPE_CLIENT, constraintName=FK_C_CLI_SCOPE_SCOPE; dropForeignKeyConstraint baseTableName=CLIENT_SC...		\N	4.29.1	\N	\N	4882624355
13.0.0-KEYCLOAK-17992-drop-constraints	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.256193	93	MARK_RAN	9:544d201116a0fcc5a5da0925fbbc3bde	dropPrimaryKey constraintName=C_CLI_SCOPE_BIND, tableName=CLIENT_SCOPE_CLIENT; dropIndex indexName=IDX_CLSCOPE_CL, tableName=CLIENT_SCOPE_CLIENT; dropIndex indexName=IDX_CL_CLSCOPE, tableName=CLIENT_SCOPE_CLIENT		\N	4.29.1	\N	\N	4882624355
13.0.0-increase-column-size-federated	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.267156	94	EXECUTED	9:43c0c1055b6761b4b3e89de76d612ccf	modifyDataType columnName=CLIENT_ID, tableName=CLIENT_SCOPE_CLIENT; modifyDataType columnName=SCOPE_ID, tableName=CLIENT_SCOPE_CLIENT		\N	4.29.1	\N	\N	4882624355
13.0.0-KEYCLOAK-17992-recreate-constraints	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.2687	95	MARK_RAN	9:8bd711fd0330f4fe980494ca43ab1139	addNotNullConstraint columnName=CLIENT_ID, tableName=CLIENT_SCOPE_CLIENT; addNotNullConstraint columnName=SCOPE_ID, tableName=CLIENT_SCOPE_CLIENT; addPrimaryKey constraintName=C_CLI_SCOPE_BIND, tableName=CLIENT_SCOPE_CLIENT; createIndex indexName=...		\N	4.29.1	\N	\N	4882624355
json-string-accomodation-fixed	keycloak	META-INF/jpa-changelog-13.0.0.xml	2025-04-17 09:37:09.274112	96	EXECUTED	9:e07d2bc0970c348bb06fb63b1f82ddbf	addColumn tableName=REALM_ATTRIBUTE; update tableName=REALM_ATTRIBUTE; dropColumn columnName=VALUE, tableName=REALM_ATTRIBUTE; renameColumn newColumnName=VALUE, oldColumnName=VALUE_NEW, tableName=REALM_ATTRIBUTE		\N	4.29.1	\N	\N	4882624355
14.0.0-KEYCLOAK-11019	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.388933	97	EXECUTED	9:24fb8611e97f29989bea412aa38d12b7	createIndex indexName=IDX_OFFLINE_CSS_PRELOAD, tableName=OFFLINE_CLIENT_SESSION; createIndex indexName=IDX_OFFLINE_USS_BY_USER, tableName=OFFLINE_USER_SESSION; createIndex indexName=IDX_OFFLINE_USS_BY_USERSESS, tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
14.0.0-KEYCLOAK-18286	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.390102	98	MARK_RAN	9:259f89014ce2506ee84740cbf7163aa7	createIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
14.0.0-KEYCLOAK-18286-revert	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.40563	99	MARK_RAN	9:04baaf56c116ed19951cbc2cca584022	dropIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
14.0.0-KEYCLOAK-18286-supported-dbs	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.439137	100	EXECUTED	9:60ca84a0f8c94ec8c3504a5a3bc88ee8	createIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
14.0.0-KEYCLOAK-18286-unsupported-dbs	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.440248	101	MARK_RAN	9:d3d977031d431db16e2c181ce49d73e9	createIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
KEYCLOAK-17267-add-index-to-user-attributes	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.47428	102	EXECUTED	9:0b305d8d1277f3a89a0a53a659ad274c	createIndex indexName=IDX_USER_ATTRIBUTE_NAME, tableName=USER_ATTRIBUTE		\N	4.29.1	\N	\N	4882624355
KEYCLOAK-18146-add-saml-art-binding-identifier	keycloak	META-INF/jpa-changelog-14.0.0.xml	2025-04-17 09:37:09.478436	103	EXECUTED	9:2c374ad2cdfe20e2905a84c8fac48460	customChange		\N	4.29.1	\N	\N	4882624355
15.0.0-KEYCLOAK-18467	keycloak	META-INF/jpa-changelog-15.0.0.xml	2025-04-17 09:37:09.483598	104	EXECUTED	9:47a760639ac597360a8219f5b768b4de	addColumn tableName=REALM_LOCALIZATIONS; update tableName=REALM_LOCALIZATIONS; dropColumn columnName=TEXTS, tableName=REALM_LOCALIZATIONS; renameColumn newColumnName=TEXTS, oldColumnName=TEXTS_NEW, tableName=REALM_LOCALIZATIONS; addNotNullConstrai...		\N	4.29.1	\N	\N	4882624355
17.0.0-9562	keycloak	META-INF/jpa-changelog-17.0.0.xml	2025-04-17 09:37:09.517947	105	EXECUTED	9:a6272f0576727dd8cad2522335f5d99e	createIndex indexName=IDX_USER_SERVICE_ACCOUNT, tableName=USER_ENTITY		\N	4.29.1	\N	\N	4882624355
18.0.0-10625-IDX_ADMIN_EVENT_TIME	keycloak	META-INF/jpa-changelog-18.0.0.xml	2025-04-17 09:37:09.551304	106	EXECUTED	9:015479dbd691d9cc8669282f4828c41d	createIndex indexName=IDX_ADMIN_EVENT_TIME, tableName=ADMIN_EVENT_ENTITY		\N	4.29.1	\N	\N	4882624355
18.0.15-30992-index-consent	keycloak	META-INF/jpa-changelog-18.0.15.xml	2025-04-17 09:37:09.590841	107	EXECUTED	9:80071ede7a05604b1f4906f3bf3b00f0	createIndex indexName=IDX_USCONSENT_SCOPE_ID, tableName=USER_CONSENT_CLIENT_SCOPE		\N	4.29.1	\N	\N	4882624355
19.0.0-10135	keycloak	META-INF/jpa-changelog-19.0.0.xml	2025-04-17 09:37:09.594488	108	EXECUTED	9:9518e495fdd22f78ad6425cc30630221	customChange		\N	4.29.1	\N	\N	4882624355
20.0.0-12964-supported-dbs	keycloak	META-INF/jpa-changelog-20.0.0.xml	2025-04-17 09:37:09.629556	109	EXECUTED	9:e5f243877199fd96bcc842f27a1656ac	createIndex indexName=IDX_GROUP_ATT_BY_NAME_VALUE, tableName=GROUP_ATTRIBUTE		\N	4.29.1	\N	\N	4882624355
20.0.0-12964-unsupported-dbs	keycloak	META-INF/jpa-changelog-20.0.0.xml	2025-04-17 09:37:09.630732	110	MARK_RAN	9:1a6fcaa85e20bdeae0a9ce49b41946a5	createIndex indexName=IDX_GROUP_ATT_BY_NAME_VALUE, tableName=GROUP_ATTRIBUTE		\N	4.29.1	\N	\N	4882624355
client-attributes-string-accomodation-fixed	keycloak	META-INF/jpa-changelog-20.0.0.xml	2025-04-17 09:37:09.635633	111	EXECUTED	9:3f332e13e90739ed0c35b0b25b7822ca	addColumn tableName=CLIENT_ATTRIBUTES; update tableName=CLIENT_ATTRIBUTES; dropColumn columnName=VALUE, tableName=CLIENT_ATTRIBUTES; renameColumn newColumnName=VALUE, oldColumnName=VALUE_NEW, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
21.0.2-17277	keycloak	META-INF/jpa-changelog-21.0.2.xml	2025-04-17 09:37:09.640143	112	EXECUTED	9:7ee1f7a3fb8f5588f171fb9a6ab623c0	customChange		\N	4.29.1	\N	\N	4882624355
21.1.0-19404	keycloak	META-INF/jpa-changelog-21.1.0.xml	2025-04-17 09:37:09.663625	113	EXECUTED	9:3d7e830b52f33676b9d64f7f2b2ea634	modifyDataType columnName=DECISION_STRATEGY, tableName=RESOURCE_SERVER_POLICY; modifyDataType columnName=LOGIC, tableName=RESOURCE_SERVER_POLICY; modifyDataType columnName=POLICY_ENFORCE_MODE, tableName=RESOURCE_SERVER		\N	4.29.1	\N	\N	4882624355
21.1.0-19404-2	keycloak	META-INF/jpa-changelog-21.1.0.xml	2025-04-17 09:37:09.665694	114	MARK_RAN	9:627d032e3ef2c06c0e1f73d2ae25c26c	addColumn tableName=RESOURCE_SERVER_POLICY; update tableName=RESOURCE_SERVER_POLICY; dropColumn columnName=DECISION_STRATEGY, tableName=RESOURCE_SERVER_POLICY; renameColumn newColumnName=DECISION_STRATEGY, oldColumnName=DECISION_STRATEGY_NEW, tabl...		\N	4.29.1	\N	\N	4882624355
22.0.0-17484-updated	keycloak	META-INF/jpa-changelog-22.0.0.xml	2025-04-17 09:37:09.66974	115	EXECUTED	9:90af0bfd30cafc17b9f4d6eccd92b8b3	customChange		\N	4.29.1	\N	\N	4882624355
22.0.5-24031	keycloak	META-INF/jpa-changelog-22.0.0.xml	2025-04-17 09:37:09.670702	116	MARK_RAN	9:a60d2d7b315ec2d3eba9e2f145f9df28	customChange		\N	4.29.1	\N	\N	4882624355
23.0.0-12062	keycloak	META-INF/jpa-changelog-23.0.0.xml	2025-04-17 09:37:09.674958	117	EXECUTED	9:2168fbe728fec46ae9baf15bf80927b8	addColumn tableName=COMPONENT_CONFIG; update tableName=COMPONENT_CONFIG; dropColumn columnName=VALUE, tableName=COMPONENT_CONFIG; renameColumn newColumnName=VALUE, oldColumnName=VALUE_NEW, tableName=COMPONENT_CONFIG		\N	4.29.1	\N	\N	4882624355
23.0.0-17258	keycloak	META-INF/jpa-changelog-23.0.0.xml	2025-04-17 09:37:09.676984	118	EXECUTED	9:36506d679a83bbfda85a27ea1864dca8	addColumn tableName=EVENT_ENTITY		\N	4.29.1	\N	\N	4882624355
24.0.0-9758	keycloak	META-INF/jpa-changelog-24.0.0.xml	2025-04-17 09:37:09.796911	119	EXECUTED	9:502c557a5189f600f0f445a9b49ebbce	addColumn tableName=USER_ATTRIBUTE; addColumn tableName=FED_USER_ATTRIBUTE; createIndex indexName=USER_ATTR_LONG_VALUES, tableName=USER_ATTRIBUTE; createIndex indexName=FED_USER_ATTR_LONG_VALUES, tableName=FED_USER_ATTRIBUTE; createIndex indexName...		\N	4.29.1	\N	\N	4882624355
24.0.0-9758-2	keycloak	META-INF/jpa-changelog-24.0.0.xml	2025-04-17 09:37:09.800206	120	EXECUTED	9:bf0fdee10afdf597a987adbf291db7b2	customChange		\N	4.29.1	\N	\N	4882624355
24.0.0-26618-drop-index-if-present	keycloak	META-INF/jpa-changelog-24.0.0.xml	2025-04-17 09:37:09.804706	121	MARK_RAN	9:04baaf56c116ed19951cbc2cca584022	dropIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
24.0.0-26618-reindex	keycloak	META-INF/jpa-changelog-24.0.0.xml	2025-04-17 09:37:09.835193	122	EXECUTED	9:08707c0f0db1cef6b352db03a60edc7f	createIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
24.0.2-27228	keycloak	META-INF/jpa-changelog-24.0.2.xml	2025-04-17 09:37:09.83844	123	EXECUTED	9:eaee11f6b8aa25d2cc6a84fb86fc6238	customChange		\N	4.29.1	\N	\N	4882624355
24.0.2-27967-drop-index-if-present	keycloak	META-INF/jpa-changelog-24.0.2.xml	2025-04-17 09:37:09.839295	124	MARK_RAN	9:04baaf56c116ed19951cbc2cca584022	dropIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
24.0.2-27967-reindex	keycloak	META-INF/jpa-changelog-24.0.2.xml	2025-04-17 09:37:09.840466	125	MARK_RAN	9:d3d977031d431db16e2c181ce49d73e9	createIndex indexName=IDX_CLIENT_ATT_BY_NAME_VALUE, tableName=CLIENT_ATTRIBUTES		\N	4.29.1	\N	\N	4882624355
25.0.0-28265-tables	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.844426	126	EXECUTED	9:deda2df035df23388af95bbd36c17cef	addColumn tableName=OFFLINE_USER_SESSION; addColumn tableName=OFFLINE_CLIENT_SESSION		\N	4.29.1	\N	\N	4882624355
25.0.0-28265-index-creation	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.875541	127	EXECUTED	9:3e96709818458ae49f3c679ae58d263a	createIndex indexName=IDX_OFFLINE_USS_BY_LAST_SESSION_REFRESH, tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
25.0.0-28265-index-cleanup	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.8807	128	EXECUTED	9:8c0cfa341a0474385b324f5c4b2dfcc1	dropIndex indexName=IDX_OFFLINE_USS_CREATEDON, tableName=OFFLINE_USER_SESSION; dropIndex indexName=IDX_OFFLINE_USS_PRELOAD, tableName=OFFLINE_USER_SESSION; dropIndex indexName=IDX_OFFLINE_USS_BY_USERSESS, tableName=OFFLINE_USER_SESSION; dropIndex ...		\N	4.29.1	\N	\N	4882624355
25.0.0-28265-index-2-mysql	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.881927	129	MARK_RAN	9:b7ef76036d3126bb83c2423bf4d449d6	createIndex indexName=IDX_OFFLINE_USS_BY_BROKER_SESSION_ID, tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
25.0.0-28265-index-2-not-mysql	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.913886	130	EXECUTED	9:23396cf51ab8bc1ae6f0cac7f9f6fcf7	createIndex indexName=IDX_OFFLINE_USS_BY_BROKER_SESSION_ID, tableName=OFFLINE_USER_SESSION		\N	4.29.1	\N	\N	4882624355
25.0.0-org	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.928114	131	EXECUTED	9:5c859965c2c9b9c72136c360649af157	createTable tableName=ORG; addUniqueConstraint constraintName=UK_ORG_NAME, tableName=ORG; addUniqueConstraint constraintName=UK_ORG_GROUP, tableName=ORG; createTable tableName=ORG_DOMAIN		\N	4.29.1	\N	\N	4882624355
unique-consentuser	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.936694	132	EXECUTED	9:5857626a2ea8767e9a6c66bf3a2cb32f	customChange; dropUniqueConstraint constraintName=UK_JKUWUVD56ONTGSUHOGM8UEWRT, tableName=USER_CONSENT; addUniqueConstraint constraintName=UK_LOCAL_CONSENT, tableName=USER_CONSENT; addUniqueConstraint constraintName=UK_EXTERNAL_CONSENT, tableName=...		\N	4.29.1	\N	\N	4882624355
unique-consentuser-mysql	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.93778	133	MARK_RAN	9:b79478aad5adaa1bc428e31563f55e8e	customChange; dropUniqueConstraint constraintName=UK_JKUWUVD56ONTGSUHOGM8UEWRT, tableName=USER_CONSENT; addUniqueConstraint constraintName=UK_LOCAL_CONSENT, tableName=USER_CONSENT; addUniqueConstraint constraintName=UK_EXTERNAL_CONSENT, tableName=...		\N	4.29.1	\N	\N	4882624355
25.0.0-28861-index-creation	keycloak	META-INF/jpa-changelog-25.0.0.xml	2025-04-17 09:37:09.99948	134	EXECUTED	9:b9acb58ac958d9ada0fe12a5d4794ab1	createIndex indexName=IDX_PERM_TICKET_REQUESTER, tableName=RESOURCE_SERVER_PERM_TICKET; createIndex indexName=IDX_PERM_TICKET_OWNER, tableName=RESOURCE_SERVER_PERM_TICKET		\N	4.29.1	\N	\N	4882624355
26.0.0-org-alias	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.007935	135	EXECUTED	9:6ef7d63e4412b3c2d66ed179159886a4	addColumn tableName=ORG; update tableName=ORG; addNotNullConstraint columnName=ALIAS, tableName=ORG; addUniqueConstraint constraintName=UK_ORG_ALIAS, tableName=ORG		\N	4.29.1	\N	\N	4882624355
26.0.0-org-group	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.014837	136	EXECUTED	9:da8e8087d80ef2ace4f89d8c5b9ca223	addColumn tableName=KEYCLOAK_GROUP; update tableName=KEYCLOAK_GROUP; addNotNullConstraint columnName=TYPE, tableName=KEYCLOAK_GROUP; customChange		\N	4.29.1	\N	\N	4882624355
26.0.0-org-indexes	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.047864	137	EXECUTED	9:79b05dcd610a8c7f25ec05135eec0857	createIndex indexName=IDX_ORG_DOMAIN_ORG_ID, tableName=ORG_DOMAIN		\N	4.29.1	\N	\N	4882624355
26.0.0-org-group-membership	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.052105	138	EXECUTED	9:a6ace2ce583a421d89b01ba2a28dc2d4	addColumn tableName=USER_GROUP_MEMBERSHIP; update tableName=USER_GROUP_MEMBERSHIP; addNotNullConstraint columnName=MEMBERSHIP_TYPE, tableName=USER_GROUP_MEMBERSHIP		\N	4.29.1	\N	\N	4882624355
31296-persist-revoked-access-tokens	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.057143	139	EXECUTED	9:64ef94489d42a358e8304b0e245f0ed4	createTable tableName=REVOKED_TOKEN; addPrimaryKey constraintName=CONSTRAINT_RT, tableName=REVOKED_TOKEN		\N	4.29.1	\N	\N	4882624355
31725-index-persist-revoked-access-tokens	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.088363	140	EXECUTED	9:b994246ec2bf7c94da881e1d28782c7b	createIndex indexName=IDX_REV_TOKEN_ON_EXPIRE, tableName=REVOKED_TOKEN		\N	4.29.1	\N	\N	4882624355
26.0.0-idps-for-login	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.15182	141	EXECUTED	9:51f5fffadf986983d4bd59582c6c1604	addColumn tableName=IDENTITY_PROVIDER; createIndex indexName=IDX_IDP_REALM_ORG, tableName=IDENTITY_PROVIDER; createIndex indexName=IDX_IDP_FOR_LOGIN, tableName=IDENTITY_PROVIDER; customChange		\N	4.29.1	\N	\N	4882624355
26.0.0-32583-drop-redundant-index-on-client-session	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.223307	142	EXECUTED	9:24972d83bf27317a055d234187bb4af9	dropIndex indexName=IDX_US_SESS_ID_ON_CL_SESS, tableName=OFFLINE_CLIENT_SESSION		\N	4.29.1	\N	\N	4882624355
26.0.0.32582-remove-tables-user-session-user-session-note-and-client-session	keycloak	META-INF/jpa-changelog-26.0.0.xml	2025-04-17 09:37:10.252862	143	EXECUTED	9:febdc0f47f2ed241c59e60f58c3ceea5	dropTable tableName=CLIENT_SESSION_ROLE; dropTable tableName=CLIENT_SESSION_NOTE; dropTable tableName=CLIENT_SESSION_PROT_MAPPER; dropTable tableName=CLIENT_SESSION_AUTH_STATUS; dropTable tableName=CLIENT_USER_SESSION_NOTE; dropTable tableName=CLI...		\N	4.29.1	\N	\N	4882624355
\.


--
-- Data for Name: databasechangeloglock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.databasechangeloglock (id, locked, lockgranted, lockedby) FROM stdin;
1	f	\N	\N
1000	f	\N	\N
\.


--
-- Data for Name: default_client_scope; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.default_client_scope (realm_id, scope_id, default_scope) FROM stdin;
192b747f-cc6b-4514-9904-8dc8d7e66dd2	4999edf9-75bd-43c5-b8b5-9ea5faeb7a0e	f
192b747f-cc6b-4514-9904-8dc8d7e66dd2	1495b7b0-fc0b-4545-bb13-699b884ece27	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	6b7f2ddd-a2f3-477c-8fa5-cc6de6e2737a	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	c61f3a1b-521c-43d3-ba07-3948e69e8220	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	1ec773bb-8239-4d27-8b17-d2048896323e	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	6dfefdb0-933e-42e7-96da-059e0a453301	f
192b747f-cc6b-4514-9904-8dc8d7e66dd2	92c3d6b6-0019-4eb6-a1b3-26014c7c155f	f
192b747f-cc6b-4514-9904-8dc8d7e66dd2	21b29af3-f84f-40a3-8e19-75b76ef0bec9	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	3578efd1-5e65-44bd-a6b2-7c5d55db277b	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	a016c5f1-6f8d-447e-afb0-3372328f2e40	f
192b747f-cc6b-4514-9904-8dc8d7e66dd2	f1efa0ae-1d9d-47cb-9aed-aa75751e3957	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	126579ad-b242-4ea2-8137-62ba3fe6712b	t
192b747f-cc6b-4514-9904-8dc8d7e66dd2	e097dd72-2a08-4eae-9a07-b7308fcd4dbe	f
\.


--
-- Data for Name: event_entity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_entity (id, client_id, details_json, error, ip_address, realm_id, session_id, event_time, type, user_id, details_json_long_value) FROM stdin;
\.


--
-- Data for Name: fed_user_attribute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_attribute (id, name, user_id, realm_id, storage_provider_id, value, long_value_hash, long_value_hash_lower_case, long_value) FROM stdin;
\.


--
-- Data for Name: fed_user_consent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_consent (id, client_id, user_id, realm_id, storage_provider_id, created_date, last_updated_date, client_storage_provider, external_client_id) FROM stdin;
\.


--
-- Data for Name: fed_user_consent_cl_scope; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_consent_cl_scope (user_consent_id, scope_id) FROM stdin;
\.


--
-- Data for Name: fed_user_credential; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_credential (id, salt, type, created_date, user_id, realm_id, storage_provider_id, user_label, secret_data, credential_data, priority) FROM stdin;
\.


--
-- Data for Name: fed_user_group_membership; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_group_membership (group_id, user_id, realm_id, storage_provider_id) FROM stdin;
\.


--
-- Data for Name: fed_user_required_action; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_required_action (required_action, user_id, realm_id, storage_provider_id) FROM stdin;
\.


--
-- Data for Name: fed_user_role_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fed_user_role_mapping (role_id, user_id, realm_id, storage_provider_id) FROM stdin;
\.


--
-- Data for Name: federated_identity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.federated_identity (identity_provider, realm_id, federated_user_id, federated_username, token, user_id) FROM stdin;
\.


--
-- Data for Name: federated_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.federated_user (id, storage_provider_id, realm_id) FROM stdin;
\.


--
-- Data for Name: group_attribute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.group_attribute (id, name, value, group_id) FROM stdin;
\.


--
-- Data for Name: group_role_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.group_role_mapping (role_id, group_id) FROM stdin;
\.


--
-- Data for Name: identity_provider; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.identity_provider (internal_id, enabled, provider_alias, provider_id, store_token, authenticate_by_default, realm_id, add_token_role, trust_email, first_broker_login_flow_id, post_broker_login_flow_id, provider_display_name, link_only, organization_id, hide_on_login) FROM stdin;
\.


--
-- Data for Name: identity_provider_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.identity_provider_config (identity_provider_id, value, name) FROM stdin;
\.


--
-- Data for Name: identity_provider_mapper; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.identity_provider_mapper (id, name, idp_alias, idp_mapper_name, realm_id) FROM stdin;
\.


--
-- Data for Name: idp_mapper_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.idp_mapper_config (idp_mapper_id, value, name) FROM stdin;
\.


--
-- Data for Name: keycloak_group; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.keycloak_group (id, name, parent_group, realm_id, type) FROM stdin;
\.


--
-- Data for Name: keycloak_role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.keycloak_role (id, client_realm_constraint, client_role, description, name, realm_id, client, realm) FROM stdin;
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	${role_default-roles}	default-roles-master	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N	\N
02ba84df-bb65-43e3-8916-5e518699231d	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	${role_admin}	admin	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N	\N
ee2f1373-6ac5-49d7-98e3-a0ffdad2675f	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	${role_create-realm}	create-realm	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N	\N
758952b9-aa37-44b1-9f02-f771314a93be	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_create-client}	create-client	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
c27cfc75-9308-40f4-b569-e37fa24b231d	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_view-realm}	view-realm	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
29803f4d-ad19-401d-a525-6f065f7cf98c	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_view-users}	view-users	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
e21ca91f-b8a1-4142-9436-62d6d2d194c2	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_view-clients}	view-clients	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
f19f2df2-dc83-4781-9462-36f430c852f5	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_view-events}	view-events	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
058594e4-107b-41b1-872b-86d8d8dceb4e	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_view-identity-providers}	view-identity-providers	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
8bd567bb-095f-4af3-a994-1976b469c98f	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_view-authorization}	view-authorization	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
aba6b3a8-f690-4ebf-93ea-7969c1048bab	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_manage-realm}	manage-realm	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
559b339c-63d4-4a2e-b52a-ae5f82339e2a	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_manage-users}	manage-users	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
2d61209b-c5cf-46df-ae57-7b78ada95c5e	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_manage-clients}	manage-clients	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
211257fc-0b84-495f-89a9-00adc347a0a5	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_manage-events}	manage-events	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
52045592-803b-4092-a90b-5e1dbfc2894e	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_manage-identity-providers}	manage-identity-providers	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
20f8ec6c-1e6f-4b5d-a224-c5915582a915	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_manage-authorization}	manage-authorization	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
2ba5b48b-7887-47e2-b124-b3df1d37ee05	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_query-users}	query-users	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
e29e2482-dcab-495f-8649-c9984ab937da	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_query-clients}	query-clients	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
1952d13a-672e-4fe2-bab2-020fc73c55ba	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_query-realms}	query-realms	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
15288571-f312-40e8-a16c-61041675f9fc	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_query-groups}	query-groups	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
201f6675-d2e5-482e-91bf-4e8fc81860dc	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_view-profile}	view-profile	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
67e864d9-dbb3-4cca-849e-7e09ca4d4882	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_manage-account}	manage-account	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
e11201ed-f5d0-443f-aeea-de707545c02e	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_manage-account-links}	manage-account-links	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
f9d048bf-cec2-4b5f-aefc-92d7cc9205de	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_view-applications}	view-applications	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
1902e667-d0c8-43a9-b1fa-723fa0b910d8	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_view-consent}	view-consent	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
3320b7c0-afb2-4ccb-8241-53373162191d	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_manage-consent}	manage-consent	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
24435dd1-d2fe-4d8d-944f-71ce7a8f8542	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_view-groups}	view-groups	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
0a0fc09d-df9f-4f44-b723-f209a9b474fd	0343b55f-85c0-49db-bc27-0c2d06959dcd	t	${role_delete-account}	delete-account	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0343b55f-85c0-49db-bc27-0c2d06959dcd	\N
d21b5ad0-6a73-402e-bde5-4dbcd460c487	cf3794f6-c76d-4f0e-9840-4d690325b769	t	${role_read-token}	read-token	192b747f-cc6b-4514-9904-8dc8d7e66dd2	cf3794f6-c76d-4f0e-9840-4d690325b769	\N
49e6ca73-8c62-4015-9858-360b43d66360	64320c8d-e0bf-4432-9742-df7836b26849	t	${role_impersonation}	impersonation	192b747f-cc6b-4514-9904-8dc8d7e66dd2	64320c8d-e0bf-4432-9742-df7836b26849	\N
2e482ccc-26b9-4a76-bc89-74da3337e442	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	${role_offline-access}	offline_access	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N	\N
e33626fb-9002-4fe5-8d3d-c605db5e53c6	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	${role_uma_authorization}	uma_authorization	192b747f-cc6b-4514-9904-8dc8d7e66dd2	\N	\N
3b483712-7bc6-4feb-a4e1-4962de810269	5ec31698-abf8-43e0-91e6-00f278c2cf8e	t	\N	uma_protection	192b747f-cc6b-4514-9904-8dc8d7e66dd2	5ec31698-abf8-43e0-91e6-00f278c2cf8e	\N
\.


--
-- Data for Name: migration_model; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.migration_model (id, version, update_time) FROM stdin;
oc42e	26.0.1	1744882630
\.


--
-- Data for Name: offline_client_session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_client_session (user_session_id, client_id, offline_flag, "timestamp", data, client_storage_provider, external_client_id, version) FROM stdin;
\.


--
-- Data for Name: offline_user_session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_user_session (user_session_id, user_id, realm_id, created_on, offline_flag, data, last_session_refresh, broker_session_id, version) FROM stdin;
\.


--
-- Data for Name: org; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.org (id, enabled, realm_id, group_id, name, description, alias, redirect_url) FROM stdin;
\.


--
-- Data for Name: org_domain; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.org_domain (id, name, verified, org_id) FROM stdin;
\.


--
-- Data for Name: policy_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.policy_config (policy_id, name, value) FROM stdin;
ce86cb9c-0f7e-48db-96aa-a1d0ac35c1b1	code	// by default, grants any permission associated with this policy\n$evaluation.grant();\n
3a2723cf-e593-47b6-b18e-b92d62cae698	defaultResourceType	urn:chanjo-client-apis:resources:default
\.


--
-- Data for Name: protocol_mapper; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.protocol_mapper (id, name, protocol, protocol_mapper_name, client_id, client_scope_id) FROM stdin;
a1212ad1-8816-4f89-9d26-a5e577324a88	audience resolve	openid-connect	oidc-audience-resolve-mapper	217d0422-e48a-453a-a745-d788b0cca2e2	\N
0f53f183-b294-4262-b3b3-7db6eb16e892	locale	openid-connect	oidc-usermodel-attribute-mapper	045191a1-6675-4196-88f8-c3d8834672ff	\N
ee723ad4-341d-4fec-801f-6754a969cba3	role list	saml	saml-role-list-mapper	\N	1495b7b0-fc0b-4545-bb13-699b884ece27
41548236-d516-4ca3-a5a6-8b1f8f53d011	organization	saml	saml-organization-membership-mapper	\N	6b7f2ddd-a2f3-477c-8fa5-cc6de6e2737a
d7debc6a-8746-4867-b528-08dc3287756f	full name	openid-connect	oidc-full-name-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	family name	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	given name	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
1b75be2f-7ae7-4be4-ad46-532f2f75361a	middle name	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
4231974e-7356-41b9-9deb-aaa941cacd96	nickname	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
1393570d-dece-46df-b243-d83d3806a03b	username	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	profile	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	picture	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
1a7de310-6bdc-431d-a00d-25496c4be5b4	website	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
46ea4570-203e-4032-af7e-9b710954d669	gender	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
d6b706f0-ae02-45b9-9006-65a3374104d4	birthdate	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	zoneinfo	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
42c33b94-9574-40ac-bee9-ddfa0a237546	locale	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
0d3c3eae-aa33-40df-be95-e31ad1cfc702	updated at	openid-connect	oidc-usermodel-attribute-mapper	\N	c61f3a1b-521c-43d3-ba07-3948e69e8220
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	email	openid-connect	oidc-usermodel-attribute-mapper	\N	1ec773bb-8239-4d27-8b17-d2048896323e
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	email verified	openid-connect	oidc-usermodel-property-mapper	\N	1ec773bb-8239-4d27-8b17-d2048896323e
912f312f-a175-44da-a310-6da6c0ed6365	address	openid-connect	oidc-address-mapper	\N	6dfefdb0-933e-42e7-96da-059e0a453301
bafcc186-045c-4202-b9b2-67173cb3b7c6	phone number	openid-connect	oidc-usermodel-attribute-mapper	\N	92c3d6b6-0019-4eb6-a1b3-26014c7c155f
529e5f38-f18c-4290-829e-adab8fe5c859	phone number verified	openid-connect	oidc-usermodel-attribute-mapper	\N	92c3d6b6-0019-4eb6-a1b3-26014c7c155f
ad783b4b-67b1-4aa9-863a-fd52351c0aad	realm roles	openid-connect	oidc-usermodel-realm-role-mapper	\N	21b29af3-f84f-40a3-8e19-75b76ef0bec9
71270b29-d0b5-4d99-958d-e4fc0c37eb14	client roles	openid-connect	oidc-usermodel-client-role-mapper	\N	21b29af3-f84f-40a3-8e19-75b76ef0bec9
2532aa51-f4d1-4c85-9eaa-05e865a4ec1f	audience resolve	openid-connect	oidc-audience-resolve-mapper	\N	21b29af3-f84f-40a3-8e19-75b76ef0bec9
aaf1610a-f426-4988-a809-157879cebcc3	allowed web origins	openid-connect	oidc-allowed-origins-mapper	\N	3578efd1-5e65-44bd-a6b2-7c5d55db277b
934d2912-1819-4736-accc-e39be23c121e	upn	openid-connect	oidc-usermodel-attribute-mapper	\N	a016c5f1-6f8d-447e-afb0-3372328f2e40
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	groups	openid-connect	oidc-usermodel-realm-role-mapper	\N	a016c5f1-6f8d-447e-afb0-3372328f2e40
51ef4468-9f8f-42a7-b4b5-e6bbf842a0ab	acr loa level	openid-connect	oidc-acr-mapper	\N	f1efa0ae-1d9d-47cb-9aed-aa75751e3957
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	auth_time	openid-connect	oidc-usersessionmodel-note-mapper	\N	126579ad-b242-4ea2-8137-62ba3fe6712b
c6be68af-3975-485f-bdbc-eba23b9087bd	sub	openid-connect	oidc-sub-mapper	\N	126579ad-b242-4ea2-8137-62ba3fe6712b
401e9253-012c-4317-832b-37378472efe3	organization	openid-connect	oidc-organization-membership-mapper	\N	e097dd72-2a08-4eae-9a07-b7308fcd4dbe
505c794a-3d46-45a1-bef8-4f3acd395566	Client ID	openid-connect	oidc-usersessionmodel-note-mapper	5ec31698-abf8-43e0-91e6-00f278c2cf8e	\N
d42abe32-161c-464c-8798-21500f0104c4	Client Host	openid-connect	oidc-usersessionmodel-note-mapper	5ec31698-abf8-43e0-91e6-00f278c2cf8e	\N
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	Client IP Address	openid-connect	oidc-usersessionmodel-note-mapper	5ec31698-abf8-43e0-91e6-00f278c2cf8e	\N
\.


--
-- Data for Name: protocol_mapper_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.protocol_mapper_config (protocol_mapper_id, value, name) FROM stdin;
0f53f183-b294-4262-b3b3-7db6eb16e892	true	introspection.token.claim
0f53f183-b294-4262-b3b3-7db6eb16e892	true	userinfo.token.claim
0f53f183-b294-4262-b3b3-7db6eb16e892	locale	user.attribute
0f53f183-b294-4262-b3b3-7db6eb16e892	true	id.token.claim
0f53f183-b294-4262-b3b3-7db6eb16e892	true	access.token.claim
0f53f183-b294-4262-b3b3-7db6eb16e892	locale	claim.name
0f53f183-b294-4262-b3b3-7db6eb16e892	String	jsonType.label
ee723ad4-341d-4fec-801f-6754a969cba3	false	single
ee723ad4-341d-4fec-801f-6754a969cba3	Basic	attribute.nameformat
ee723ad4-341d-4fec-801f-6754a969cba3	Role	attribute.name
0d3c3eae-aa33-40df-be95-e31ad1cfc702	true	introspection.token.claim
0d3c3eae-aa33-40df-be95-e31ad1cfc702	true	userinfo.token.claim
0d3c3eae-aa33-40df-be95-e31ad1cfc702	updatedAt	user.attribute
0d3c3eae-aa33-40df-be95-e31ad1cfc702	true	id.token.claim
0d3c3eae-aa33-40df-be95-e31ad1cfc702	true	access.token.claim
0d3c3eae-aa33-40df-be95-e31ad1cfc702	updated_at	claim.name
0d3c3eae-aa33-40df-be95-e31ad1cfc702	long	jsonType.label
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	true	introspection.token.claim
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	true	userinfo.token.claim
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	zoneinfo	user.attribute
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	true	id.token.claim
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	true	access.token.claim
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	zoneinfo	claim.name
12ba7e07-3151-4e6c-9451-2b0fcb7da04b	String	jsonType.label
1393570d-dece-46df-b243-d83d3806a03b	true	introspection.token.claim
1393570d-dece-46df-b243-d83d3806a03b	true	userinfo.token.claim
1393570d-dece-46df-b243-d83d3806a03b	username	user.attribute
1393570d-dece-46df-b243-d83d3806a03b	true	id.token.claim
1393570d-dece-46df-b243-d83d3806a03b	true	access.token.claim
1393570d-dece-46df-b243-d83d3806a03b	preferred_username	claim.name
1393570d-dece-46df-b243-d83d3806a03b	String	jsonType.label
1a7de310-6bdc-431d-a00d-25496c4be5b4	true	introspection.token.claim
1a7de310-6bdc-431d-a00d-25496c4be5b4	true	userinfo.token.claim
1a7de310-6bdc-431d-a00d-25496c4be5b4	website	user.attribute
1a7de310-6bdc-431d-a00d-25496c4be5b4	true	id.token.claim
1a7de310-6bdc-431d-a00d-25496c4be5b4	true	access.token.claim
1a7de310-6bdc-431d-a00d-25496c4be5b4	website	claim.name
1a7de310-6bdc-431d-a00d-25496c4be5b4	String	jsonType.label
1b75be2f-7ae7-4be4-ad46-532f2f75361a	true	introspection.token.claim
1b75be2f-7ae7-4be4-ad46-532f2f75361a	true	userinfo.token.claim
1b75be2f-7ae7-4be4-ad46-532f2f75361a	middleName	user.attribute
1b75be2f-7ae7-4be4-ad46-532f2f75361a	true	id.token.claim
1b75be2f-7ae7-4be4-ad46-532f2f75361a	true	access.token.claim
1b75be2f-7ae7-4be4-ad46-532f2f75361a	middle_name	claim.name
1b75be2f-7ae7-4be4-ad46-532f2f75361a	String	jsonType.label
4231974e-7356-41b9-9deb-aaa941cacd96	true	introspection.token.claim
4231974e-7356-41b9-9deb-aaa941cacd96	true	userinfo.token.claim
4231974e-7356-41b9-9deb-aaa941cacd96	nickname	user.attribute
4231974e-7356-41b9-9deb-aaa941cacd96	true	id.token.claim
4231974e-7356-41b9-9deb-aaa941cacd96	true	access.token.claim
4231974e-7356-41b9-9deb-aaa941cacd96	nickname	claim.name
4231974e-7356-41b9-9deb-aaa941cacd96	String	jsonType.label
42c33b94-9574-40ac-bee9-ddfa0a237546	true	introspection.token.claim
42c33b94-9574-40ac-bee9-ddfa0a237546	true	userinfo.token.claim
42c33b94-9574-40ac-bee9-ddfa0a237546	locale	user.attribute
42c33b94-9574-40ac-bee9-ddfa0a237546	true	id.token.claim
42c33b94-9574-40ac-bee9-ddfa0a237546	true	access.token.claim
42c33b94-9574-40ac-bee9-ddfa0a237546	locale	claim.name
42c33b94-9574-40ac-bee9-ddfa0a237546	String	jsonType.label
46ea4570-203e-4032-af7e-9b710954d669	true	introspection.token.claim
46ea4570-203e-4032-af7e-9b710954d669	true	userinfo.token.claim
46ea4570-203e-4032-af7e-9b710954d669	gender	user.attribute
46ea4570-203e-4032-af7e-9b710954d669	true	id.token.claim
46ea4570-203e-4032-af7e-9b710954d669	true	access.token.claim
46ea4570-203e-4032-af7e-9b710954d669	gender	claim.name
46ea4570-203e-4032-af7e-9b710954d669	String	jsonType.label
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	true	introspection.token.claim
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	true	userinfo.token.claim
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	lastName	user.attribute
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	true	id.token.claim
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	true	access.token.claim
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	family_name	claim.name
47a6d0b2-4755-4b2c-97dc-9fe78c305e65	String	jsonType.label
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	true	introspection.token.claim
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	true	userinfo.token.claim
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	firstName	user.attribute
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	true	id.token.claim
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	true	access.token.claim
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	given_name	claim.name
5dddb08a-186f-40bf-95e5-0f0ba02ec36c	String	jsonType.label
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	true	introspection.token.claim
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	true	userinfo.token.claim
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	profile	user.attribute
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	true	id.token.claim
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	true	access.token.claim
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	profile	claim.name
6fadf74f-92c7-4459-b2da-d0ca16a8d3a6	String	jsonType.label
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	true	introspection.token.claim
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	true	userinfo.token.claim
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	picture	user.attribute
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	true	id.token.claim
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	true	access.token.claim
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	picture	claim.name
7ddae9b3-f6be-4dc2-b867-7c2bebeca1a2	String	jsonType.label
d6b706f0-ae02-45b9-9006-65a3374104d4	true	introspection.token.claim
d6b706f0-ae02-45b9-9006-65a3374104d4	true	userinfo.token.claim
d6b706f0-ae02-45b9-9006-65a3374104d4	birthdate	user.attribute
d6b706f0-ae02-45b9-9006-65a3374104d4	true	id.token.claim
d6b706f0-ae02-45b9-9006-65a3374104d4	true	access.token.claim
d6b706f0-ae02-45b9-9006-65a3374104d4	birthdate	claim.name
d6b706f0-ae02-45b9-9006-65a3374104d4	String	jsonType.label
d7debc6a-8746-4867-b528-08dc3287756f	true	introspection.token.claim
d7debc6a-8746-4867-b528-08dc3287756f	true	userinfo.token.claim
d7debc6a-8746-4867-b528-08dc3287756f	true	id.token.claim
d7debc6a-8746-4867-b528-08dc3287756f	true	access.token.claim
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	true	introspection.token.claim
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	true	userinfo.token.claim
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	emailVerified	user.attribute
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	true	id.token.claim
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	true	access.token.claim
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	email_verified	claim.name
2b0851a1-9edd-4b63-83c2-6c991bdaa4c5	boolean	jsonType.label
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	true	introspection.token.claim
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	true	userinfo.token.claim
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	email	user.attribute
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	true	id.token.claim
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	true	access.token.claim
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	email	claim.name
6f2ca21c-349a-4f8b-b356-f27e9a5e39db	String	jsonType.label
912f312f-a175-44da-a310-6da6c0ed6365	formatted	user.attribute.formatted
912f312f-a175-44da-a310-6da6c0ed6365	country	user.attribute.country
912f312f-a175-44da-a310-6da6c0ed6365	true	introspection.token.claim
912f312f-a175-44da-a310-6da6c0ed6365	postal_code	user.attribute.postal_code
912f312f-a175-44da-a310-6da6c0ed6365	true	userinfo.token.claim
912f312f-a175-44da-a310-6da6c0ed6365	street	user.attribute.street
912f312f-a175-44da-a310-6da6c0ed6365	true	id.token.claim
912f312f-a175-44da-a310-6da6c0ed6365	region	user.attribute.region
912f312f-a175-44da-a310-6da6c0ed6365	true	access.token.claim
912f312f-a175-44da-a310-6da6c0ed6365	locality	user.attribute.locality
529e5f38-f18c-4290-829e-adab8fe5c859	true	introspection.token.claim
529e5f38-f18c-4290-829e-adab8fe5c859	true	userinfo.token.claim
529e5f38-f18c-4290-829e-adab8fe5c859	phoneNumberVerified	user.attribute
529e5f38-f18c-4290-829e-adab8fe5c859	true	id.token.claim
529e5f38-f18c-4290-829e-adab8fe5c859	true	access.token.claim
529e5f38-f18c-4290-829e-adab8fe5c859	phone_number_verified	claim.name
529e5f38-f18c-4290-829e-adab8fe5c859	boolean	jsonType.label
bafcc186-045c-4202-b9b2-67173cb3b7c6	true	introspection.token.claim
bafcc186-045c-4202-b9b2-67173cb3b7c6	true	userinfo.token.claim
bafcc186-045c-4202-b9b2-67173cb3b7c6	phoneNumber	user.attribute
bafcc186-045c-4202-b9b2-67173cb3b7c6	true	id.token.claim
bafcc186-045c-4202-b9b2-67173cb3b7c6	true	access.token.claim
bafcc186-045c-4202-b9b2-67173cb3b7c6	phone_number	claim.name
bafcc186-045c-4202-b9b2-67173cb3b7c6	String	jsonType.label
2532aa51-f4d1-4c85-9eaa-05e865a4ec1f	true	introspection.token.claim
2532aa51-f4d1-4c85-9eaa-05e865a4ec1f	true	access.token.claim
71270b29-d0b5-4d99-958d-e4fc0c37eb14	true	introspection.token.claim
71270b29-d0b5-4d99-958d-e4fc0c37eb14	true	multivalued
71270b29-d0b5-4d99-958d-e4fc0c37eb14	foo	user.attribute
71270b29-d0b5-4d99-958d-e4fc0c37eb14	true	access.token.claim
71270b29-d0b5-4d99-958d-e4fc0c37eb14	resource_access.${client_id}.roles	claim.name
71270b29-d0b5-4d99-958d-e4fc0c37eb14	String	jsonType.label
ad783b4b-67b1-4aa9-863a-fd52351c0aad	true	introspection.token.claim
ad783b4b-67b1-4aa9-863a-fd52351c0aad	true	multivalued
ad783b4b-67b1-4aa9-863a-fd52351c0aad	foo	user.attribute
ad783b4b-67b1-4aa9-863a-fd52351c0aad	true	access.token.claim
ad783b4b-67b1-4aa9-863a-fd52351c0aad	realm_access.roles	claim.name
ad783b4b-67b1-4aa9-863a-fd52351c0aad	String	jsonType.label
aaf1610a-f426-4988-a809-157879cebcc3	true	introspection.token.claim
aaf1610a-f426-4988-a809-157879cebcc3	true	access.token.claim
934d2912-1819-4736-accc-e39be23c121e	true	introspection.token.claim
934d2912-1819-4736-accc-e39be23c121e	true	userinfo.token.claim
934d2912-1819-4736-accc-e39be23c121e	username	user.attribute
934d2912-1819-4736-accc-e39be23c121e	true	id.token.claim
934d2912-1819-4736-accc-e39be23c121e	true	access.token.claim
934d2912-1819-4736-accc-e39be23c121e	upn	claim.name
934d2912-1819-4736-accc-e39be23c121e	String	jsonType.label
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	true	introspection.token.claim
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	true	multivalued
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	foo	user.attribute
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	true	id.token.claim
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	true	access.token.claim
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	groups	claim.name
a0759a02-9a60-4e3b-bf81-2827ea87b8d1	String	jsonType.label
51ef4468-9f8f-42a7-b4b5-e6bbf842a0ab	true	introspection.token.claim
51ef4468-9f8f-42a7-b4b5-e6bbf842a0ab	true	id.token.claim
51ef4468-9f8f-42a7-b4b5-e6bbf842a0ab	true	access.token.claim
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	AUTH_TIME	user.session.note
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	true	introspection.token.claim
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	true	id.token.claim
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	true	access.token.claim
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	auth_time	claim.name
63b17d03-46b8-49f5-8ad4-25b07d47e6b2	long	jsonType.label
c6be68af-3975-485f-bdbc-eba23b9087bd	true	introspection.token.claim
c6be68af-3975-485f-bdbc-eba23b9087bd	true	access.token.claim
401e9253-012c-4317-832b-37378472efe3	true	introspection.token.claim
401e9253-012c-4317-832b-37378472efe3	true	multivalued
401e9253-012c-4317-832b-37378472efe3	true	id.token.claim
401e9253-012c-4317-832b-37378472efe3	true	access.token.claim
401e9253-012c-4317-832b-37378472efe3	organization	claim.name
401e9253-012c-4317-832b-37378472efe3	String	jsonType.label
505c794a-3d46-45a1-bef8-4f3acd395566	clientId	user.session.note
505c794a-3d46-45a1-bef8-4f3acd395566	true	id.token.claim
505c794a-3d46-45a1-bef8-4f3acd395566	true	access.token.claim
505c794a-3d46-45a1-bef8-4f3acd395566	clientId	claim.name
505c794a-3d46-45a1-bef8-4f3acd395566	String	jsonType.label
505c794a-3d46-45a1-bef8-4f3acd395566	true	userinfo.token.claim
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	clientAddress	user.session.note
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	true	id.token.claim
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	true	access.token.claim
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	clientAddress	claim.name
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	String	jsonType.label
a239a5f4-9d75-4cfe-801d-4a09c17cb0d0	true	userinfo.token.claim
d42abe32-161c-464c-8798-21500f0104c4	clientHost	user.session.note
d42abe32-161c-464c-8798-21500f0104c4	true	id.token.claim
d42abe32-161c-464c-8798-21500f0104c4	true	access.token.claim
d42abe32-161c-464c-8798-21500f0104c4	clientHost	claim.name
d42abe32-161c-464c-8798-21500f0104c4	String	jsonType.label
d42abe32-161c-464c-8798-21500f0104c4	true	userinfo.token.claim
\.


--
-- Data for Name: realm; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm (id, access_code_lifespan, user_action_lifespan, access_token_lifespan, account_theme, admin_theme, email_theme, enabled, events_enabled, events_expiration, login_theme, name, not_before, password_policy, registration_allowed, remember_me, reset_password_allowed, social, ssl_required, sso_idle_timeout, sso_max_lifespan, update_profile_on_soc_login, verify_email, master_admin_client, login_lifespan, internationalization_enabled, default_locale, reg_email_as_username, admin_events_enabled, admin_events_details_enabled, edit_username_allowed, otp_policy_counter, otp_policy_window, otp_policy_period, otp_policy_digits, otp_policy_alg, otp_policy_type, browser_flow, registration_flow, direct_grant_flow, reset_credentials_flow, client_auth_flow, offline_session_idle_timeout, revoke_refresh_token, access_token_life_implicit, login_with_email_allowed, duplicate_emails_allowed, docker_auth_flow, refresh_token_max_reuse, allow_user_managed_access, sso_max_lifespan_remember_me, sso_idle_timeout_remember_me, default_role) FROM stdin;
192b747f-cc6b-4514-9904-8dc8d7e66dd2	86400	300	86400	\N	\N	\N	t	f	0	\N	master	0	\N	f	f	f	f	EXTERNAL	1800	36000	f	f	64320c8d-e0bf-4432-9742-df7836b26849	1800	f	\N	f	f	f	f	0	1	30	6	HmacSHA1	totp	d6b06077-e2fb-499f-b953-1396fd4ec1d6	4f8142fc-a08d-4158-b60a-359ff8d1968d	f3639928-1e72-4487-813d-7e6ac4248bf2	9e03d963-b872-4adb-970b-7c1ace3b730f	65d1466f-3453-4342-ab81-ba34ded7d8a9	2592000	f	86400	t	f	519c4253-5054-487e-87e9-25973853d50b	0	f	0	0	7006910d-3a1e-44fc-be4e-af9c9cd9b2ae
\.


--
-- Data for Name: realm_attribute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_attribute (name, realm_id, value) FROM stdin;
bruteForceProtected	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
permanentLockout	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
maxTemporaryLockouts	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
maxFailureWaitSeconds	192b747f-cc6b-4514-9904-8dc8d7e66dd2	900
minimumQuickLoginWaitSeconds	192b747f-cc6b-4514-9904-8dc8d7e66dd2	60
waitIncrementSeconds	192b747f-cc6b-4514-9904-8dc8d7e66dd2	60
quickLoginCheckMilliSeconds	192b747f-cc6b-4514-9904-8dc8d7e66dd2	1000
maxDeltaTimeSeconds	192b747f-cc6b-4514-9904-8dc8d7e66dd2	43200
failureFactor	192b747f-cc6b-4514-9904-8dc8d7e66dd2	30
realmReusableOtpCode	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
firstBrokerLoginFlowId	192b747f-cc6b-4514-9904-8dc8d7e66dd2	b0330b9e-c035-4c90-bd6b-6b448bc02fe6
displayName	192b747f-cc6b-4514-9904-8dc8d7e66dd2	Keycloak
displayNameHtml	192b747f-cc6b-4514-9904-8dc8d7e66dd2	<div class="kc-logo-text"><span>Keycloak</span></div>
defaultSignatureAlgorithm	192b747f-cc6b-4514-9904-8dc8d7e66dd2	RS256
offlineSessionMaxLifespanEnabled	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
offlineSessionMaxLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	5184000
shortVerificationUri	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
parRequestUriLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	60
actionTokenGeneratedByUserLifespan.verify-email	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
actionTokenGeneratedByUserLifespan.idp-verify-account-via-email	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
actionTokenGeneratedByUserLifespan.reset-credentials	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
actionTokenGeneratedByUserLifespan.execute-actions	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
cibaBackchannelTokenDeliveryMode	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poll
cibaExpiresIn	192b747f-cc6b-4514-9904-8dc8d7e66dd2	120
cibaAuthRequestedUserHint	192b747f-cc6b-4514-9904-8dc8d7e66dd2	login_hint
cibaInterval	192b747f-cc6b-4514-9904-8dc8d7e66dd2	5
organizationsEnabled	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
actionTokenGeneratedByAdminLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	43200
actionTokenGeneratedByUserLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	300
oauth2DeviceCodeLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	600
oauth2DevicePollingInterval	192b747f-cc6b-4514-9904-8dc8d7e66dd2	5
clientSessionIdleTimeout	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
clientSessionMaxLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
clientOfflineSessionIdleTimeout	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
clientOfflineSessionMaxLifespan	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
webAuthnPolicyRpEntityName	192b747f-cc6b-4514-9904-8dc8d7e66dd2	keycloak
webAuthnPolicySignatureAlgorithms	192b747f-cc6b-4514-9904-8dc8d7e66dd2	ES256,RS256
webAuthnPolicyRpId	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
webAuthnPolicyAttestationConveyancePreference	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyAuthenticatorAttachment	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyRequireResidentKey	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyUserVerificationRequirement	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyCreateTimeout	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
webAuthnPolicyAvoidSameAuthenticatorRegister	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
webAuthnPolicyRpEntityNamePasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	keycloak
webAuthnPolicySignatureAlgorithmsPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	ES256,RS256
webAuthnPolicyRpIdPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
webAuthnPolicyAttestationConveyancePreferencePasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyAuthenticatorAttachmentPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyRequireResidentKeyPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyUserVerificationRequirementPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	not specified
webAuthnPolicyCreateTimeoutPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0
webAuthnPolicyAvoidSameAuthenticatorRegisterPasswordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	false
client-policies.profiles	192b747f-cc6b-4514-9904-8dc8d7e66dd2	{"profiles":[]}
client-policies.policies	192b747f-cc6b-4514-9904-8dc8d7e66dd2	{"policies":[]}
_browser_header.contentSecurityPolicyReportOnly	192b747f-cc6b-4514-9904-8dc8d7e66dd2	
_browser_header.xContentTypeOptions	192b747f-cc6b-4514-9904-8dc8d7e66dd2	nosniff
_browser_header.referrerPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	no-referrer
_browser_header.xRobotsTag	192b747f-cc6b-4514-9904-8dc8d7e66dd2	none
_browser_header.xFrameOptions	192b747f-cc6b-4514-9904-8dc8d7e66dd2	SAMEORIGIN
_browser_header.xXSSProtection	192b747f-cc6b-4514-9904-8dc8d7e66dd2	1; mode=block
_browser_header.contentSecurityPolicy	192b747f-cc6b-4514-9904-8dc8d7e66dd2	frame-src 'self'; frame-ancestors 'self'; object-src 'none';
_browser_header.strictTransportSecurity	192b747f-cc6b-4514-9904-8dc8d7e66dd2	max-age=31536000; includeSubDomains
\.


--
-- Data for Name: realm_default_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_default_groups (realm_id, group_id) FROM stdin;
\.


--
-- Data for Name: realm_enabled_event_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_enabled_event_types (realm_id, value) FROM stdin;
\.


--
-- Data for Name: realm_events_listeners; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_events_listeners (realm_id, value) FROM stdin;
192b747f-cc6b-4514-9904-8dc8d7e66dd2	jboss-logging
\.


--
-- Data for Name: realm_localizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_localizations (realm_id, locale, texts) FROM stdin;
\.


--
-- Data for Name: realm_required_credential; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_required_credential (type, form_label, input, secret, realm_id) FROM stdin;
password	password	t	t	192b747f-cc6b-4514-9904-8dc8d7e66dd2
\.


--
-- Data for Name: realm_smtp_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_smtp_config (realm_id, value, name) FROM stdin;
\.


--
-- Data for Name: realm_supported_locales; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.realm_supported_locales (realm_id, value) FROM stdin;
\.


--
-- Data for Name: redirect_uris; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.redirect_uris (client_id, value) FROM stdin;
0343b55f-85c0-49db-bc27-0c2d06959dcd	/realms/master/account/*
217d0422-e48a-453a-a745-d788b0cca2e2	/realms/master/account/*
045191a1-6675-4196-88f8-c3d8834672ff	/admin/master/console/*
5ec31698-abf8-43e0-91e6-00f278c2cf8e	+
\.


--
-- Data for Name: required_action_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.required_action_config (required_action_id, value, name) FROM stdin;
\.


--
-- Data for Name: required_action_provider; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.required_action_provider (id, alias, name, realm_id, enabled, default_action, provider_id, priority) FROM stdin;
f06c1548-dec3-4789-aeb4-defe023d999e	VERIFY_EMAIL	Verify Email	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	VERIFY_EMAIL	50
2c4e9cab-6d90-4706-a524-3ce417c55dd5	UPDATE_PROFILE	Update Profile	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	UPDATE_PROFILE	40
b09a7ebb-b466-4950-8338-826cf1d7c405	CONFIGURE_TOTP	Configure OTP	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	CONFIGURE_TOTP	10
d8016766-f0b8-4861-9a24-531e6474e9e1	UPDATE_PASSWORD	Update Password	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	UPDATE_PASSWORD	30
95b6fb2e-75a1-4901-b5fc-6080c02d9076	TERMS_AND_CONDITIONS	Terms and Conditions	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	f	TERMS_AND_CONDITIONS	20
27f63682-5845-4da3-ae1a-951e6ba3eb2e	delete_account	Delete Account	192b747f-cc6b-4514-9904-8dc8d7e66dd2	f	f	delete_account	60
cd2aef05-f0e0-4bcf-87ce-eca7ab3c981e	delete_credential	Delete Credential	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	delete_credential	100
6eed7d44-cf54-4154-8cf4-156c4fdf4ce5	update_user_locale	Update User Locale	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	update_user_locale	1000
d57593d1-515e-4f51-a318-65b26c6423c8	webauthn-register	Webauthn Register	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	webauthn-register	70
bfe3f80b-8abd-4ca9-a8e9-bc9da435e886	webauthn-register-passwordless	Webauthn Register Passwordless	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	webauthn-register-passwordless	80
c2c733ba-e978-45f4-98dd-33b5f2de7bfe	VERIFY_PROFILE	Verify Profile	192b747f-cc6b-4514-9904-8dc8d7e66dd2	t	f	VERIFY_PROFILE	90
\.


--
-- Data for Name: resource_attribute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_attribute (id, name, value, resource_id) FROM stdin;
\.


--
-- Data for Name: resource_policy; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_policy (resource_id, policy_id) FROM stdin;
\.


--
-- Data for Name: resource_scope; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_scope (resource_id, scope_id) FROM stdin;
\.


--
-- Data for Name: resource_server; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_server (id, allow_rs_remote_mgmt, policy_enforce_mode, decision_strategy) FROM stdin;
5ec31698-abf8-43e0-91e6-00f278c2cf8e	t	0	1
\.


--
-- Data for Name: resource_server_perm_ticket; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_server_perm_ticket (id, owner, requester, created_timestamp, granted_timestamp, resource_id, scope_id, resource_server_id, policy_id) FROM stdin;
\.


--
-- Data for Name: resource_server_policy; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_server_policy (id, name, description, type, decision_strategy, logic, resource_server_id, owner) FROM stdin;
ce86cb9c-0f7e-48db-96aa-a1d0ac35c1b1	Default Policy	A policy that grants access only for users within this realm	js	0	0	5ec31698-abf8-43e0-91e6-00f278c2cf8e	\N
3a2723cf-e593-47b6-b18e-b92d62cae698	Default Permission	A permission that applies to the default resource type	resource	1	0	5ec31698-abf8-43e0-91e6-00f278c2cf8e	\N
\.


--
-- Data for Name: resource_server_resource; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_server_resource (id, name, type, icon_uri, owner, resource_server_id, owner_managed_access, display_name) FROM stdin;
1bbe9ab2-138f-49da-a702-7ef48b3b4a34	Default Resource	urn:chanjo-client-apis:resources:default	\N	5ec31698-abf8-43e0-91e6-00f278c2cf8e	5ec31698-abf8-43e0-91e6-00f278c2cf8e	f	\N
\.


--
-- Data for Name: resource_server_scope; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_server_scope (id, name, icon_uri, resource_server_id, display_name) FROM stdin;
\.


--
-- Data for Name: resource_uris; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource_uris (resource_id, value) FROM stdin;
1bbe9ab2-138f-49da-a702-7ef48b3b4a34	/*
\.


--
-- Data for Name: revoked_token; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.revoked_token (id, expire) FROM stdin;
\.


--
-- Data for Name: role_attribute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_attribute (id, role_id, name, value) FROM stdin;
\.


--
-- Data for Name: scope_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scope_mapping (client_id, role_id) FROM stdin;
217d0422-e48a-453a-a745-d788b0cca2e2	67e864d9-dbb3-4cca-849e-7e09ca4d4882
217d0422-e48a-453a-a745-d788b0cca2e2	24435dd1-d2fe-4d8d-944f-71ce7a8f8542
\.


--
-- Data for Name: scope_policy; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scope_policy (scope_id, policy_id) FROM stdin;
\.


--
-- Data for Name: user_attribute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_attribute (name, value, user_id, id, long_value_hash, long_value_hash_lower_case, long_value) FROM stdin;
is_temporary_admin	true	44efa4df-2606-46a5-bb4e-c544a2bc79fb	c5bda9b1-7947-46e4-ae04-3bf8f43cb3b5	\N	\N	\N
\.


--
-- Data for Name: user_consent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_consent (id, client_id, user_id, created_date, last_updated_date, client_storage_provider, external_client_id) FROM stdin;
\.


--
-- Data for Name: user_consent_client_scope; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_consent_client_scope (user_consent_id, scope_id) FROM stdin;
\.


--
-- Data for Name: user_entity; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_entity (id, email, email_constraint, email_verified, enabled, federation_link, first_name, last_name, realm_id, username, created_timestamp, service_account_client_link, not_before) FROM stdin;
44efa4df-2606-46a5-bb4e-c544a2bc79fb	\N	351b0d95-c03b-4561-bbf9-5df825150000	f	t	\N	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	admin	1744882632337	\N	0
19f13e6a-6a74-4d19-81ee-aa326292467f	\N	c7a1a73d-8a94-43ea-81b8-b4264fe38ff9	f	t	\N	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	service-account-chanjo-client-apis	1744882935688	5ec31698-abf8-43e0-91e6-00f278c2cf8e	0
c28c0880-9125-40dc-83d4-f6fd316f0933	jkiprotich@intellisoftkenya.com	jkiprotich@intellisoftkenya.com	f	t	\N	Kiprotich	Japheth	192b747f-cc6b-4514-9904-8dc8d7e66dd2	41424142	1744963693324	\N	0
f2d85825-0f39-41bc-9daf-d9dae645d672	202501@gmail.com	202501@gmail.com	f	t	\N	202501	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202501	1747281919710	\N	0
bae6d904-fe73-43cb-b316-5bc3f352f0c5	202502@gmail.com	202502@gmail.com	f	t	\N	202502	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202502	1747281992668	\N	0
ba36d957-8e98-4457-8d99-e393db7d21fe	202503@gmail.com	202503@gmail.com	f	t	\N	202503	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202503	1747282027988	\N	0
654c0726-120d-46a2-825b-345682872e49	202504@gmail.com	202504@gmail.com	f	t	\N	202504	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202504	1747282040872	\N	0
b4ce3748-b9a0-48ba-b42c-14721463a681	202505@gmail.com	202505@gmail.com	f	t	\N	202505	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202505	1747282057931	\N	0
312634aa-fe98-4d0e-8c0c-ea81e85a3223	202506@gmail.com	202506@gmail.com	f	t	\N	202506	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202506	1747282097834	\N	0
bebdb6bd-3b84-4f1f-a987-661eda22e1f8	202507@gmail.com	202507@gmail.com	f	t	\N	202507	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202507	1747282110297	\N	0
6d9a1706-65e6-433d-b728-197435204704	202508@gmail.com	202508@gmail.com	f	t	\N	202508	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202508	1747282135794	\N	0
bd45c3b2-d765-461f-b0f1-239cd96e7df4	202509@gmail.com	202509@gmail.com	f	t	\N	202509	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202509	1747282153201	\N	0
2ecc4748-968e-48c5-aae2-c58a03196052	202510@gmail.com	202510@gmail.com	f	t	\N	202510	User	192b747f-cc6b-4514-9904-8dc8d7e66dd2	202510	1747282179446	\N	0
2090aa34-7ec4-488c-9f87-89bf0011870c	sanitas@gmail.com	sanitas@gmail.com	f	t	\N	Sanitas EMR	13009	192b747f-cc6b-4514-9904-8dc8d7e66dd2	b9fa6c44cdaa485b8a223b5e0b965e13	1749585122302	\N	0
7e264d68-9aca-43fe-a8e9-1bffe3f975c6	sanitas-123@gmail.com	sanitas-123@gmail.com	f	t	\N	Sanitas EMR	13009	192b747f-cc6b-4514-9904-8dc8d7e66dd2	ede29001156e4615878baf214a3fdcfa	1749625834291	\N	0
3e816711-d657-4a2b-9faa-fc35ae9ece96	icl-123@gmail.com	icl-123@gmail.com	f	t	\N	Intellisoft EMR	12345	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0010a1ae6f854f66b7a15ffe1330a1d3	1750058309652	\N	0
97a5c489-7690-4a2e-ac73-6e83bc56a250	bamolo123@gmail.com	bamolo123@gmail.com	f	t	\N	Health X Test EMR	12345	192b747f-cc6b-4514-9904-8dc8d7e66dd2	ef8c1002e8354c52aad253bdca76f952	1750403129893	\N	0
4783332a-f8cb-4d9e-be8e-cc64c80ee280	test@gmail.com	test@gmail.com	f	t	\N	Testing EMR	8010	192b747f-cc6b-4514-9904-8dc8d7e66dd2	c7e210c4b5f7464d8206ca721f916e13	1750417602482	\N	0
74acc73d-fdcc-4f28-a86d-5f07b77b4d26	turn-dev@gmail.com	turn-dev@gmail.com	f	t	\N	Turn.io	12345	192b747f-cc6b-4514-9904-8dc8d7e66dd2	0e22dca549894c3f9a4248ebb1aae735	1750863138095	\N	0
eee1e33c-a926-4fae-a579-ba2392522035	kibwage@gmail.com	kibwage@gmail.com	f	t	\N	Sanitas EMR	12345	192b747f-cc6b-4514-9904-8dc8d7e66dd2	40f981592dd94bb1b94b189fa6d8e83a	1751370553559	\N	0
11a6c7a4-dde2-43c1-8d05-22eca6e83a01	ruphasoft@dev.com	ruphasoft@dev.com	f	t	\N	RuphaSoft	10101	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-dc1f26e77feb4db9b7e0c0ccfcfd8381	1752575260581	\N	0
2147e070-4e8f-410d-9943-187058862201	ruphasoft@gmail.com	ruphasoft@gmail.com	f	t	\N	RUPHASOFT HMIS	3122	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-101c994b68de4bec87155170dad58419	1753680764941	\N	0
28deea38-10e4-4312-9714-ba4e4c8f1e46	ruphasofts@gmail.com	ruphasofts@gmail.com	f	t	\N	RUPHASOFT HMIS	31225	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-fa47048648c34362890c64a639d256bc	1753773267435	\N	0
ce93c5fd-493e-48de-a338-52c637769d7c	dev@ruphasoft.com	dev@ruphasoft.com	f	t	\N	Ruphasoft HMIS 2	50002	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-6d5b039f13784725bd992c0c8224eb90	1753775609799	\N	0
5c0c8446-72f9-43cd-9055-5f763fb61743	devs@ruphasoft.com	devs@ruphasoft.com	f	t	\N	Ruphasoft HMIS 4	50005	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-f1128070f7a94c93bacf34521efb7900	1753776372558	\N	0
1cbc085a-54ce-4ead-95bc-4c3e5ee75572	devs3@ruphasoft.com	devs3@ruphasoft.com	f	t	\N	Ruphasoft HMIS 6	500034	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-d493eb3c29be47e28078154f1f7f8c2f	1753779890368	\N	0
3d430690-7e57-4569-b5a3-c4b7caac4d2c	devs9@ruphasoft.com	devs9@ruphasoft.com	f	t	\N	Ruphasoft HMIS 30	50434	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-baeded698a7b41ca9937a14ffdba10b5	1753780059316	\N	0
aa2cbe36-e41e-432c-8c57-bdce8030dec4	devs90@ruphasoft.com	devs90@ruphasoft.com	f	t	\N	Ruphasoft HMIS 33	51434	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-15aa6532627340438fed6557c862d6f1	1753783413011	\N	0
ff94545a-f8af-4139-bd3a-9fe6e9577f20	devs908@ruphasoft.com	devs908@ruphasoft.com	f	t	\N	Ruphasoft HMIS 335	51435	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-ad5721a2543b42d1a37721e476acda45	1753783504911	\N	0
33d5430b-5f2f-489a-9356-f6eb88585466	devs9088@ruphasoft.com	devs9088@ruphasoft.com	f	t	\N	Ruphasoft HMIS 3358	514356	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-45cccd0adee6435d8a9d4c54f4b2e69d	1753783685496	\N	0
fedc44a5-d4e2-4627-b7d0-f1dbf0d0f83e	devs90889@ruphasoft.com	devs90889@ruphasoft.com	f	t	\N	Ruphasoft HMIS 33589	9514356	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-c9e4cc440cfc4d6aa0db6213ea24ea6c	1753783767110	\N	0
e71c1fd2-6e0d-4eda-9b32-23e09f4df3c7	nes@ruphasoft.com	nes@ruphasoft.com	f	t	\N	Ruphasoft HMIS 1289	9517	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-4079961b891442a5a0a5cdbd4b1e282f	1753853389365	\N	0
b7d7e43e-d928-43e1-b09a-9fd4cfac1509	hmis2@ruphasoft.com	hmis2@ruphasoft.com	f	t	\N	HMIS Hopital	944	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-ee60b1b667b8431797995a5ed25c7a44	1753863227075	\N	0
d38613b2-15fb-4701-abe4-a98ef16da1b3	turn1-dev@gmail.com	turn1-dev@gmail.com	f	t	\N	Turn.io	123456	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-038049baf4de4a49acfcb3a5b7b7df16	1756456295678	\N	0
bd64c1bc-a586-44f7-b06c-44d8c830cbf3	\N	a1cd12ea-d789-4abb-a477-c2a51cae5bd8	f	t	\N	\N	\N	192b747f-cc6b-4514-9904-8dc8d7e66dd2	1010115	1744885357401	\N	0
b82451f7-fdb0-44bd-9991-a4547c197a72	turn.io-prod@dev.com	turn.io-prod@dev.com	f	t	\N	Turn.io	99999	192b747f-cc6b-4514-9904-8dc8d7e66dd2	poc-e556040ab4fa41bbbea0e9525d65ad7c	1756794607171	\N	0
9c27715f-688a-4ee8-b41c-18387181f140	itsjkiprotich@gmail.com	itsjkiprotich@gmail.com	f	t	\N	42	41	192b747f-cc6b-4514-9904-8dc8d7e66dd2	jkiprotich	1757076732187	\N	0
ae8df46e-4977-4413-aa90-48ee84ca772e	clerk-24@gmail.com	clerk-24@gmail.com	f	t	\N	Amolo	Brian	192b747f-cc6b-4514-9904-8dc8d7e66dd2	909090	1759475018057	\N	0
4f1e2106-a2d5-4f74-8995-5055f6b8455f	rail@gmail.com	rail@gmail.com	f	t	\N	Amolo	Brian	192b747f-cc6b-4514-9904-8dc8d7e66dd2	9999	1759491987833	\N	0
ec9a50a1-750c-47f1-967f-0b4b2afc4772	raila@g.com	raila@g.com	f	t	\N	Mani	Gere	192b747f-cc6b-4514-9904-8dc8d7e66dd2	7777	1759513025687	\N	0
eb41ed17-ad46-4edc-93fe-e8b0e2b793a0	jkipro.tich@intellisoftkenya.com	jkipro.tich@intellisoftkenya.com	f	t	\N	Kiprotich	Japheth	192b747f-cc6b-4514-9904-8dc8d7e66dd2	4142414243	1759741678951	\N	0
f39961c0-52b4-4ecd-8d9c-1a67619074de	its.jkiprotich@gmail.com	its.jkiprotich@gmail.com	f	t	\N	Kiprotich	Japheth	192b747f-cc6b-4514-9904-8dc8d7e66dd2	123123123	1759742049634	\N	0
0d102056-cbc9-4c85-9842-2d1d1e2b6fe1	itsjkiproti.ch@gmail.com	itsjkiproti.ch@gmail.com	f	t	\N	user	sub-county	192b747f-cc6b-4514-9904-8dc8d7e66dd2	123456	1759827679673	\N	0
afbf9f12-74c8-4dbc-b8f6-0991c6af34eb	james@gmail.com	james@gmail.com	f	t	\N	Smith	James	192b747f-cc6b-4514-9904-8dc8d7e66dd2	00000	1759884874424	\N	0
fa5a86f2-4c8a-4b32-a6b0-1555d7a22e2b	jkip.rotich@intellisoftkenya.com	jkip.rotich@intellisoftkenya.com	f	t	\N	User	County	192b747f-cc6b-4514-9904-8dc8d7e66dd2	54321	1759900498996	\N	0
c5143ee7-d532-43ac-880f-04cdbbb15a35	jkiproti.ch@intellisoftkenya.com	jkiproti.ch@intellisoftkenya.com	f	t	\N	Kiprotich	Vaccinator	192b747f-cc6b-4514-9904-8dc8d7e66dd2	43214321	1759902130377	\N	0
0dc33a1b-b6bc-4ce8-b591-ba58d6fa1ae6	jkiprotic.h@intellisoftkenya.com	jkiprotic.h@intellisoftkenya.com	f	t	\N	Kiprotich	Japheth	192b747f-cc6b-4514-9904-8dc8d7e66dd2	414141	1760006602972	\N	0
\.


--
-- Data for Name: user_federation_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_federation_config (user_federation_provider_id, value, name) FROM stdin;
\.


--
-- Data for Name: user_federation_mapper; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_federation_mapper (id, name, federation_provider_id, federation_mapper_type, realm_id) FROM stdin;
\.


--
-- Data for Name: user_federation_mapper_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_federation_mapper_config (user_federation_mapper_id, value, name) FROM stdin;
\.


--
-- Data for Name: user_federation_provider; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_federation_provider (id, changed_sync_period, display_name, full_sync_period, last_sync, priority, provider_name, realm_id) FROM stdin;
\.


--
-- Data for Name: user_group_membership; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_group_membership (group_id, user_id, membership_type) FROM stdin;
\.


--
-- Data for Name: user_required_action; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_required_action (user_id, required_action) FROM stdin;
\.


--
-- Data for Name: user_role_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_role_mapping (role_id, user_id) FROM stdin;
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	44efa4df-2606-46a5-bb4e-c544a2bc79fb
02ba84df-bb65-43e3-8916-5e518699231d	44efa4df-2606-46a5-bb4e-c544a2bc79fb
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	19f13e6a-6a74-4d19-81ee-aa326292467f
3b483712-7bc6-4feb-a4e1-4962de810269	19f13e6a-6a74-4d19-81ee-aa326292467f
49e6ca73-8c62-4015-9858-360b43d66360	19f13e6a-6a74-4d19-81ee-aa326292467f
758952b9-aa37-44b1-9f02-f771314a93be	19f13e6a-6a74-4d19-81ee-aa326292467f
d21b5ad0-6a73-402e-bde5-4dbcd460c487	19f13e6a-6a74-4d19-81ee-aa326292467f
201f6675-d2e5-482e-91bf-4e8fc81860dc	19f13e6a-6a74-4d19-81ee-aa326292467f
24435dd1-d2fe-4d8d-944f-71ce7a8f8542	19f13e6a-6a74-4d19-81ee-aa326292467f
e11201ed-f5d0-443f-aeea-de707545c02e	19f13e6a-6a74-4d19-81ee-aa326292467f
f9d048bf-cec2-4b5f-aefc-92d7cc9205de	19f13e6a-6a74-4d19-81ee-aa326292467f
3320b7c0-afb2-4ccb-8241-53373162191d	19f13e6a-6a74-4d19-81ee-aa326292467f
1902e667-d0c8-43a9-b1fa-723fa0b910d8	19f13e6a-6a74-4d19-81ee-aa326292467f
67e864d9-dbb3-4cca-849e-7e09ca4d4882	19f13e6a-6a74-4d19-81ee-aa326292467f
0a0fc09d-df9f-4f44-b723-f209a9b474fd	19f13e6a-6a74-4d19-81ee-aa326292467f
1952d13a-672e-4fe2-bab2-020fc73c55ba	19f13e6a-6a74-4d19-81ee-aa326292467f
2ba5b48b-7887-47e2-b124-b3df1d37ee05	19f13e6a-6a74-4d19-81ee-aa326292467f
e29e2482-dcab-495f-8649-c9984ab937da	19f13e6a-6a74-4d19-81ee-aa326292467f
559b339c-63d4-4a2e-b52a-ae5f82339e2a	19f13e6a-6a74-4d19-81ee-aa326292467f
15288571-f312-40e8-a16c-61041675f9fc	19f13e6a-6a74-4d19-81ee-aa326292467f
2d61209b-c5cf-46df-ae57-7b78ada95c5e	19f13e6a-6a74-4d19-81ee-aa326292467f
211257fc-0b84-495f-89a9-00adc347a0a5	19f13e6a-6a74-4d19-81ee-aa326292467f
20f8ec6c-1e6f-4b5d-a224-c5915582a915	19f13e6a-6a74-4d19-81ee-aa326292467f
8bd567bb-095f-4af3-a994-1976b469c98f	19f13e6a-6a74-4d19-81ee-aa326292467f
52045592-803b-4092-a90b-5e1dbfc2894e	19f13e6a-6a74-4d19-81ee-aa326292467f
aba6b3a8-f690-4ebf-93ea-7969c1048bab	19f13e6a-6a74-4d19-81ee-aa326292467f
29803f4d-ad19-401d-a525-6f065f7cf98c	19f13e6a-6a74-4d19-81ee-aa326292467f
058594e4-107b-41b1-872b-86d8d8dceb4e	19f13e6a-6a74-4d19-81ee-aa326292467f
c27cfc75-9308-40f4-b569-e37fa24b231d	19f13e6a-6a74-4d19-81ee-aa326292467f
f19f2df2-dc83-4781-9462-36f430c852f5	19f13e6a-6a74-4d19-81ee-aa326292467f
e21ca91f-b8a1-4142-9436-62d6d2d194c2	19f13e6a-6a74-4d19-81ee-aa326292467f
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	bd64c1bc-a586-44f7-b06c-44d8c830cbf3
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	c28c0880-9125-40dc-83d4-f6fd316f0933
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	f2d85825-0f39-41bc-9daf-d9dae645d672
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	bae6d904-fe73-43cb-b316-5bc3f352f0c5
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	ba36d957-8e98-4457-8d99-e393db7d21fe
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	654c0726-120d-46a2-825b-345682872e49
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	b4ce3748-b9a0-48ba-b42c-14721463a681
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	312634aa-fe98-4d0e-8c0c-ea81e85a3223
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	bebdb6bd-3b84-4f1f-a987-661eda22e1f8
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	6d9a1706-65e6-433d-b728-197435204704
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	bd45c3b2-d765-461f-b0f1-239cd96e7df4
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	2ecc4748-968e-48c5-aae2-c58a03196052
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	2090aa34-7ec4-488c-9f87-89bf0011870c
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	7e264d68-9aca-43fe-a8e9-1bffe3f975c6
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	3e816711-d657-4a2b-9faa-fc35ae9ece96
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	97a5c489-7690-4a2e-ac73-6e83bc56a250
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	4783332a-f8cb-4d9e-be8e-cc64c80ee280
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	74acc73d-fdcc-4f28-a86d-5f07b77b4d26
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	eee1e33c-a926-4fae-a579-ba2392522035
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	11a6c7a4-dde2-43c1-8d05-22eca6e83a01
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	2147e070-4e8f-410d-9943-187058862201
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	28deea38-10e4-4312-9714-ba4e4c8f1e46
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	ce93c5fd-493e-48de-a338-52c637769d7c
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	5c0c8446-72f9-43cd-9055-5f763fb61743
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	1cbc085a-54ce-4ead-95bc-4c3e5ee75572
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	3d430690-7e57-4569-b5a3-c4b7caac4d2c
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	aa2cbe36-e41e-432c-8c57-bdce8030dec4
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	ff94545a-f8af-4139-bd3a-9fe6e9577f20
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	33d5430b-5f2f-489a-9356-f6eb88585466
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	fedc44a5-d4e2-4627-b7d0-f1dbf0d0f83e
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	e71c1fd2-6e0d-4eda-9b32-23e09f4df3c7
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	b7d7e43e-d928-43e1-b09a-9fd4cfac1509
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	d38613b2-15fb-4701-abe4-a98ef16da1b3
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	b82451f7-fdb0-44bd-9991-a4547c197a72
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	9c27715f-688a-4ee8-b41c-18387181f140
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	ae8df46e-4977-4413-aa90-48ee84ca772e
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	4f1e2106-a2d5-4f74-8995-5055f6b8455f
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	ec9a50a1-750c-47f1-967f-0b4b2afc4772
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	eb41ed17-ad46-4edc-93fe-e8b0e2b793a0
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	f39961c0-52b4-4ecd-8d9c-1a67619074de
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	0d102056-cbc9-4c85-9842-2d1d1e2b6fe1
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	afbf9f12-74c8-4dbc-b8f6-0991c6af34eb
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	fa5a86f2-4c8a-4b32-a6b0-1555d7a22e2b
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	c5143ee7-d532-43ac-880f-04cdbbb15a35
7006910d-3a1e-44fc-be4e-af9c9cd9b2ae	0dc33a1b-b6bc-4ce8-b591-ba58d6fa1ae6
\.


--
-- Data for Name: username_login_failure; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.username_login_failure (realm_id, username, failed_login_not_before, last_failure, last_ip_failure, num_failures) FROM stdin;
\.


--
-- Data for Name: web_origins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.web_origins (client_id, value) FROM stdin;
045191a1-6675-4196-88f8-c3d8834672ff	+
\.


--
-- Name: username_login_failure CONSTRAINT_17-2; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.username_login_failure
    ADD CONSTRAINT "CONSTRAINT_17-2" PRIMARY KEY (realm_id, username);


--
-- Name: org_domain ORG_DOMAIN_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org_domain
    ADD CONSTRAINT "ORG_DOMAIN_pkey" PRIMARY KEY (id, name);


--
-- Name: org ORG_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org
    ADD CONSTRAINT "ORG_pkey" PRIMARY KEY (id);


--
-- Name: keycloak_role UK_J3RWUVD56ONTGSUHOGM184WW2-2; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.keycloak_role
    ADD CONSTRAINT "UK_J3RWUVD56ONTGSUHOGM184WW2-2" UNIQUE (name, client_realm_constraint);


--
-- Name: client_auth_flow_bindings c_cli_flow_bind; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_auth_flow_bindings
    ADD CONSTRAINT c_cli_flow_bind PRIMARY KEY (client_id, binding_name);


--
-- Name: client_scope_client c_cli_scope_bind; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope_client
    ADD CONSTRAINT c_cli_scope_bind PRIMARY KEY (client_id, scope_id);


--
-- Name: client_initial_access cnstr_client_init_acc_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_initial_access
    ADD CONSTRAINT cnstr_client_init_acc_pk PRIMARY KEY (id);


--
-- Name: realm_default_groups con_group_id_def_groups; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_default_groups
    ADD CONSTRAINT con_group_id_def_groups UNIQUE (group_id);


--
-- Name: broker_link constr_broker_link_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broker_link
    ADD CONSTRAINT constr_broker_link_pk PRIMARY KEY (identity_provider, user_id);


--
-- Name: component_config constr_component_config_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.component_config
    ADD CONSTRAINT constr_component_config_pk PRIMARY KEY (id);


--
-- Name: component constr_component_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.component
    ADD CONSTRAINT constr_component_pk PRIMARY KEY (id);


--
-- Name: fed_user_required_action constr_fed_required_action; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_required_action
    ADD CONSTRAINT constr_fed_required_action PRIMARY KEY (required_action, user_id);


--
-- Name: fed_user_attribute constr_fed_user_attr_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_attribute
    ADD CONSTRAINT constr_fed_user_attr_pk PRIMARY KEY (id);


--
-- Name: fed_user_consent constr_fed_user_consent_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_consent
    ADD CONSTRAINT constr_fed_user_consent_pk PRIMARY KEY (id);


--
-- Name: fed_user_credential constr_fed_user_cred_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_credential
    ADD CONSTRAINT constr_fed_user_cred_pk PRIMARY KEY (id);


--
-- Name: fed_user_group_membership constr_fed_user_group; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_group_membership
    ADD CONSTRAINT constr_fed_user_group PRIMARY KEY (group_id, user_id);


--
-- Name: fed_user_role_mapping constr_fed_user_role; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_role_mapping
    ADD CONSTRAINT constr_fed_user_role PRIMARY KEY (role_id, user_id);


--
-- Name: federated_user constr_federated_user; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.federated_user
    ADD CONSTRAINT constr_federated_user PRIMARY KEY (id);


--
-- Name: realm_default_groups constr_realm_default_groups; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_default_groups
    ADD CONSTRAINT constr_realm_default_groups PRIMARY KEY (realm_id, group_id);


--
-- Name: realm_enabled_event_types constr_realm_enabl_event_types; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_enabled_event_types
    ADD CONSTRAINT constr_realm_enabl_event_types PRIMARY KEY (realm_id, value);


--
-- Name: realm_events_listeners constr_realm_events_listeners; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_events_listeners
    ADD CONSTRAINT constr_realm_events_listeners PRIMARY KEY (realm_id, value);


--
-- Name: realm_supported_locales constr_realm_supported_locales; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_supported_locales
    ADD CONSTRAINT constr_realm_supported_locales PRIMARY KEY (realm_id, value);


--
-- Name: identity_provider constraint_2b; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider
    ADD CONSTRAINT constraint_2b PRIMARY KEY (internal_id);


--
-- Name: client_attributes constraint_3c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_attributes
    ADD CONSTRAINT constraint_3c PRIMARY KEY (client_id, name);


--
-- Name: event_entity constraint_4; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_entity
    ADD CONSTRAINT constraint_4 PRIMARY KEY (id);


--
-- Name: federated_identity constraint_40; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.federated_identity
    ADD CONSTRAINT constraint_40 PRIMARY KEY (identity_provider, user_id);


--
-- Name: realm constraint_4a; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm
    ADD CONSTRAINT constraint_4a PRIMARY KEY (id);


--
-- Name: user_federation_provider constraint_5c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_provider
    ADD CONSTRAINT constraint_5c PRIMARY KEY (id);


--
-- Name: client constraint_7; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT constraint_7 PRIMARY KEY (id);


--
-- Name: scope_mapping constraint_81; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scope_mapping
    ADD CONSTRAINT constraint_81 PRIMARY KEY (client_id, role_id);


--
-- Name: client_node_registrations constraint_84; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_node_registrations
    ADD CONSTRAINT constraint_84 PRIMARY KEY (client_id, name);


--
-- Name: realm_attribute constraint_9; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_attribute
    ADD CONSTRAINT constraint_9 PRIMARY KEY (name, realm_id);


--
-- Name: realm_required_credential constraint_92; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_required_credential
    ADD CONSTRAINT constraint_92 PRIMARY KEY (realm_id, type);


--
-- Name: keycloak_role constraint_a; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.keycloak_role
    ADD CONSTRAINT constraint_a PRIMARY KEY (id);


--
-- Name: admin_event_entity constraint_admin_event_entity; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_event_entity
    ADD CONSTRAINT constraint_admin_event_entity PRIMARY KEY (id);


--
-- Name: authenticator_config_entry constraint_auth_cfg_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authenticator_config_entry
    ADD CONSTRAINT constraint_auth_cfg_pk PRIMARY KEY (authenticator_id, name);


--
-- Name: authentication_execution constraint_auth_exec_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authentication_execution
    ADD CONSTRAINT constraint_auth_exec_pk PRIMARY KEY (id);


--
-- Name: authentication_flow constraint_auth_flow_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authentication_flow
    ADD CONSTRAINT constraint_auth_flow_pk PRIMARY KEY (id);


--
-- Name: authenticator_config constraint_auth_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authenticator_config
    ADD CONSTRAINT constraint_auth_pk PRIMARY KEY (id);


--
-- Name: user_role_mapping constraint_c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_role_mapping
    ADD CONSTRAINT constraint_c PRIMARY KEY (role_id, user_id);


--
-- Name: composite_role constraint_composite_role; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.composite_role
    ADD CONSTRAINT constraint_composite_role PRIMARY KEY (composite, child_role);


--
-- Name: identity_provider_config constraint_d; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider_config
    ADD CONSTRAINT constraint_d PRIMARY KEY (identity_provider_id, name);


--
-- Name: policy_config constraint_dpc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.policy_config
    ADD CONSTRAINT constraint_dpc PRIMARY KEY (policy_id, name);


--
-- Name: realm_smtp_config constraint_e; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_smtp_config
    ADD CONSTRAINT constraint_e PRIMARY KEY (realm_id, name);


--
-- Name: credential constraint_f; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credential
    ADD CONSTRAINT constraint_f PRIMARY KEY (id);


--
-- Name: user_federation_config constraint_f9; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_config
    ADD CONSTRAINT constraint_f9 PRIMARY KEY (user_federation_provider_id, name);


--
-- Name: resource_server_perm_ticket constraint_fapmt; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_perm_ticket
    ADD CONSTRAINT constraint_fapmt PRIMARY KEY (id);


--
-- Name: resource_server_resource constraint_farsr; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_resource
    ADD CONSTRAINT constraint_farsr PRIMARY KEY (id);


--
-- Name: resource_server_policy constraint_farsrp; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_policy
    ADD CONSTRAINT constraint_farsrp PRIMARY KEY (id);


--
-- Name: associated_policy constraint_farsrpap; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.associated_policy
    ADD CONSTRAINT constraint_farsrpap PRIMARY KEY (policy_id, associated_policy_id);


--
-- Name: resource_policy constraint_farsrpp; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_policy
    ADD CONSTRAINT constraint_farsrpp PRIMARY KEY (resource_id, policy_id);


--
-- Name: resource_server_scope constraint_farsrs; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_scope
    ADD CONSTRAINT constraint_farsrs PRIMARY KEY (id);


--
-- Name: resource_scope constraint_farsrsp; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_scope
    ADD CONSTRAINT constraint_farsrsp PRIMARY KEY (resource_id, scope_id);


--
-- Name: scope_policy constraint_farsrsps; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scope_policy
    ADD CONSTRAINT constraint_farsrsps PRIMARY KEY (scope_id, policy_id);


--
-- Name: user_entity constraint_fb; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entity
    ADD CONSTRAINT constraint_fb PRIMARY KEY (id);


--
-- Name: user_federation_mapper_config constraint_fedmapper_cfg_pm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_mapper_config
    ADD CONSTRAINT constraint_fedmapper_cfg_pm PRIMARY KEY (user_federation_mapper_id, name);


--
-- Name: user_federation_mapper constraint_fedmapperpm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_mapper
    ADD CONSTRAINT constraint_fedmapperpm PRIMARY KEY (id);


--
-- Name: fed_user_consent_cl_scope constraint_fgrntcsnt_clsc_pm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fed_user_consent_cl_scope
    ADD CONSTRAINT constraint_fgrntcsnt_clsc_pm PRIMARY KEY (user_consent_id, scope_id);


--
-- Name: user_consent_client_scope constraint_grntcsnt_clsc_pm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_consent_client_scope
    ADD CONSTRAINT constraint_grntcsnt_clsc_pm PRIMARY KEY (user_consent_id, scope_id);


--
-- Name: user_consent constraint_grntcsnt_pm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_consent
    ADD CONSTRAINT constraint_grntcsnt_pm PRIMARY KEY (id);


--
-- Name: keycloak_group constraint_group; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.keycloak_group
    ADD CONSTRAINT constraint_group PRIMARY KEY (id);


--
-- Name: group_attribute constraint_group_attribute_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_attribute
    ADD CONSTRAINT constraint_group_attribute_pk PRIMARY KEY (id);


--
-- Name: group_role_mapping constraint_group_role; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_role_mapping
    ADD CONSTRAINT constraint_group_role PRIMARY KEY (role_id, group_id);


--
-- Name: identity_provider_mapper constraint_idpm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider_mapper
    ADD CONSTRAINT constraint_idpm PRIMARY KEY (id);


--
-- Name: idp_mapper_config constraint_idpmconfig; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idp_mapper_config
    ADD CONSTRAINT constraint_idpmconfig PRIMARY KEY (idp_mapper_id, name);


--
-- Name: migration_model constraint_migmod; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migration_model
    ADD CONSTRAINT constraint_migmod PRIMARY KEY (id);


--
-- Name: offline_client_session constraint_offl_cl_ses_pk3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_client_session
    ADD CONSTRAINT constraint_offl_cl_ses_pk3 PRIMARY KEY (user_session_id, client_id, client_storage_provider, external_client_id, offline_flag);


--
-- Name: offline_user_session constraint_offl_us_ses_pk2; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_user_session
    ADD CONSTRAINT constraint_offl_us_ses_pk2 PRIMARY KEY (user_session_id, offline_flag);


--
-- Name: protocol_mapper constraint_pcm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_mapper
    ADD CONSTRAINT constraint_pcm PRIMARY KEY (id);


--
-- Name: protocol_mapper_config constraint_pmconfig; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_mapper_config
    ADD CONSTRAINT constraint_pmconfig PRIMARY KEY (protocol_mapper_id, name);


--
-- Name: redirect_uris constraint_redirect_uris; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.redirect_uris
    ADD CONSTRAINT constraint_redirect_uris PRIMARY KEY (client_id, value);


--
-- Name: required_action_config constraint_req_act_cfg_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.required_action_config
    ADD CONSTRAINT constraint_req_act_cfg_pk PRIMARY KEY (required_action_id, name);


--
-- Name: required_action_provider constraint_req_act_prv_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.required_action_provider
    ADD CONSTRAINT constraint_req_act_prv_pk PRIMARY KEY (id);


--
-- Name: user_required_action constraint_required_action; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_required_action
    ADD CONSTRAINT constraint_required_action PRIMARY KEY (required_action, user_id);


--
-- Name: resource_uris constraint_resour_uris_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_uris
    ADD CONSTRAINT constraint_resour_uris_pk PRIMARY KEY (resource_id, value);


--
-- Name: role_attribute constraint_role_attribute_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_attribute
    ADD CONSTRAINT constraint_role_attribute_pk PRIMARY KEY (id);


--
-- Name: revoked_token constraint_rt; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revoked_token
    ADD CONSTRAINT constraint_rt PRIMARY KEY (id);


--
-- Name: user_attribute constraint_user_attribute_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_attribute
    ADD CONSTRAINT constraint_user_attribute_pk PRIMARY KEY (id);


--
-- Name: user_group_membership constraint_user_group; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_group_membership
    ADD CONSTRAINT constraint_user_group PRIMARY KEY (group_id, user_id);


--
-- Name: web_origins constraint_web_origins; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.web_origins
    ADD CONSTRAINT constraint_web_origins PRIMARY KEY (client_id, value);


--
-- Name: databasechangeloglock databasechangeloglock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.databasechangeloglock
    ADD CONSTRAINT databasechangeloglock_pkey PRIMARY KEY (id);


--
-- Name: client_scope_attributes pk_cl_tmpl_attr; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope_attributes
    ADD CONSTRAINT pk_cl_tmpl_attr PRIMARY KEY (scope_id, name);


--
-- Name: client_scope pk_cli_template; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope
    ADD CONSTRAINT pk_cli_template PRIMARY KEY (id);


--
-- Name: resource_server pk_resource_server; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server
    ADD CONSTRAINT pk_resource_server PRIMARY KEY (id);


--
-- Name: client_scope_role_mapping pk_template_scope; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope_role_mapping
    ADD CONSTRAINT pk_template_scope PRIMARY KEY (scope_id, role_id);


--
-- Name: default_client_scope r_def_cli_scope_bind; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.default_client_scope
    ADD CONSTRAINT r_def_cli_scope_bind PRIMARY KEY (realm_id, scope_id);


--
-- Name: realm_localizations realm_localizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_localizations
    ADD CONSTRAINT realm_localizations_pkey PRIMARY KEY (realm_id, locale);


--
-- Name: resource_attribute res_attr_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_attribute
    ADD CONSTRAINT res_attr_pk PRIMARY KEY (id);


--
-- Name: keycloak_group sibling_names; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.keycloak_group
    ADD CONSTRAINT sibling_names UNIQUE (realm_id, parent_group, name);


--
-- Name: identity_provider uk_2daelwnibji49avxsrtuf6xj33; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider
    ADD CONSTRAINT uk_2daelwnibji49avxsrtuf6xj33 UNIQUE (provider_alias, realm_id);


--
-- Name: client uk_b71cjlbenv945rb6gcon438at; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT uk_b71cjlbenv945rb6gcon438at UNIQUE (realm_id, client_id);


--
-- Name: client_scope uk_cli_scope; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope
    ADD CONSTRAINT uk_cli_scope UNIQUE (realm_id, name);


--
-- Name: user_entity uk_dykn684sl8up1crfei6eckhd7; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entity
    ADD CONSTRAINT uk_dykn684sl8up1crfei6eckhd7 UNIQUE (realm_id, email_constraint);


--
-- Name: user_consent uk_external_consent; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_consent
    ADD CONSTRAINT uk_external_consent UNIQUE (client_storage_provider, external_client_id, user_id);


--
-- Name: resource_server_resource uk_frsr6t700s9v50bu18ws5ha6; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_resource
    ADD CONSTRAINT uk_frsr6t700s9v50bu18ws5ha6 UNIQUE (name, owner, resource_server_id);


--
-- Name: resource_server_perm_ticket uk_frsr6t700s9v50bu18ws5pmt; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_perm_ticket
    ADD CONSTRAINT uk_frsr6t700s9v50bu18ws5pmt UNIQUE (owner, requester, resource_server_id, resource_id, scope_id);


--
-- Name: resource_server_policy uk_frsrpt700s9v50bu18ws5ha6; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_policy
    ADD CONSTRAINT uk_frsrpt700s9v50bu18ws5ha6 UNIQUE (name, resource_server_id);


--
-- Name: resource_server_scope uk_frsrst700s9v50bu18ws5ha6; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_scope
    ADD CONSTRAINT uk_frsrst700s9v50bu18ws5ha6 UNIQUE (name, resource_server_id);


--
-- Name: user_consent uk_local_consent; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_consent
    ADD CONSTRAINT uk_local_consent UNIQUE (client_id, user_id);


--
-- Name: org uk_org_alias; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org
    ADD CONSTRAINT uk_org_alias UNIQUE (realm_id, alias);


--
-- Name: org uk_org_group; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org
    ADD CONSTRAINT uk_org_group UNIQUE (group_id);


--
-- Name: org uk_org_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org
    ADD CONSTRAINT uk_org_name UNIQUE (realm_id, name);


--
-- Name: realm uk_orvsdmla56612eaefiq6wl5oi; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm
    ADD CONSTRAINT uk_orvsdmla56612eaefiq6wl5oi UNIQUE (name);


--
-- Name: user_entity uk_ru8tt6t700s9v50bu18ws5ha6; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entity
    ADD CONSTRAINT uk_ru8tt6t700s9v50bu18ws5ha6 UNIQUE (realm_id, username);


--
-- Name: fed_user_attr_long_values; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fed_user_attr_long_values ON public.fed_user_attribute USING btree (long_value_hash, name);


--
-- Name: fed_user_attr_long_values_lower_case; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fed_user_attr_long_values_lower_case ON public.fed_user_attribute USING btree (long_value_hash_lower_case, name);


--
-- Name: idx_admin_event_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_event_time ON public.admin_event_entity USING btree (realm_id, admin_event_time);


--
-- Name: idx_assoc_pol_assoc_pol_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assoc_pol_assoc_pol_id ON public.associated_policy USING btree (associated_policy_id);


--
-- Name: idx_auth_config_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auth_config_realm ON public.authenticator_config USING btree (realm_id);


--
-- Name: idx_auth_exec_flow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auth_exec_flow ON public.authentication_execution USING btree (flow_id);


--
-- Name: idx_auth_exec_realm_flow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auth_exec_realm_flow ON public.authentication_execution USING btree (realm_id, flow_id);


--
-- Name: idx_auth_flow_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auth_flow_realm ON public.authentication_flow USING btree (realm_id);


--
-- Name: idx_cl_clscope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cl_clscope ON public.client_scope_client USING btree (scope_id);


--
-- Name: idx_client_att_by_name_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_att_by_name_value ON public.client_attributes USING btree (name, substr(value, 1, 255));


--
-- Name: idx_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_id ON public.client USING btree (client_id);


--
-- Name: idx_client_init_acc_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_init_acc_realm ON public.client_initial_access USING btree (realm_id);


--
-- Name: idx_clscope_attrs; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clscope_attrs ON public.client_scope_attributes USING btree (scope_id);


--
-- Name: idx_clscope_cl; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clscope_cl ON public.client_scope_client USING btree (client_id);


--
-- Name: idx_clscope_protmap; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clscope_protmap ON public.protocol_mapper USING btree (client_scope_id);


--
-- Name: idx_clscope_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clscope_role ON public.client_scope_role_mapping USING btree (scope_id);


--
-- Name: idx_compo_config_compo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compo_config_compo ON public.component_config USING btree (component_id);


--
-- Name: idx_component_provider_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_component_provider_type ON public.component USING btree (provider_type);


--
-- Name: idx_component_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_component_realm ON public.component USING btree (realm_id);


--
-- Name: idx_composite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_composite ON public.composite_role USING btree (composite);


--
-- Name: idx_composite_child; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_composite_child ON public.composite_role USING btree (child_role);


--
-- Name: idx_defcls_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_defcls_realm ON public.default_client_scope USING btree (realm_id);


--
-- Name: idx_defcls_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_defcls_scope ON public.default_client_scope USING btree (scope_id);


--
-- Name: idx_event_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_time ON public.event_entity USING btree (realm_id, event_time);


--
-- Name: idx_fedidentity_feduser; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fedidentity_feduser ON public.federated_identity USING btree (federated_user_id);


--
-- Name: idx_fedidentity_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fedidentity_user ON public.federated_identity USING btree (user_id);


--
-- Name: idx_fu_attribute; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_attribute ON public.fed_user_attribute USING btree (user_id, realm_id, name);


--
-- Name: idx_fu_cnsnt_ext; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_cnsnt_ext ON public.fed_user_consent USING btree (user_id, client_storage_provider, external_client_id);


--
-- Name: idx_fu_consent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_consent ON public.fed_user_consent USING btree (user_id, client_id);


--
-- Name: idx_fu_consent_ru; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_consent_ru ON public.fed_user_consent USING btree (realm_id, user_id);


--
-- Name: idx_fu_credential; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_credential ON public.fed_user_credential USING btree (user_id, type);


--
-- Name: idx_fu_credential_ru; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_credential_ru ON public.fed_user_credential USING btree (realm_id, user_id);


--
-- Name: idx_fu_group_membership; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_group_membership ON public.fed_user_group_membership USING btree (user_id, group_id);


--
-- Name: idx_fu_group_membership_ru; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_group_membership_ru ON public.fed_user_group_membership USING btree (realm_id, user_id);


--
-- Name: idx_fu_required_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_required_action ON public.fed_user_required_action USING btree (user_id, required_action);


--
-- Name: idx_fu_required_action_ru; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_required_action_ru ON public.fed_user_required_action USING btree (realm_id, user_id);


--
-- Name: idx_fu_role_mapping; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_role_mapping ON public.fed_user_role_mapping USING btree (user_id, role_id);


--
-- Name: idx_fu_role_mapping_ru; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fu_role_mapping_ru ON public.fed_user_role_mapping USING btree (realm_id, user_id);


--
-- Name: idx_group_att_by_name_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_group_att_by_name_value ON public.group_attribute USING btree (name, ((value)::character varying(250)));


--
-- Name: idx_group_attr_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_group_attr_group ON public.group_attribute USING btree (group_id);


--
-- Name: idx_group_role_mapp_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_group_role_mapp_group ON public.group_role_mapping USING btree (group_id);


--
-- Name: idx_id_prov_mapp_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_id_prov_mapp_realm ON public.identity_provider_mapper USING btree (realm_id);


--
-- Name: idx_ident_prov_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ident_prov_realm ON public.identity_provider USING btree (realm_id);


--
-- Name: idx_idp_for_login; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_idp_for_login ON public.identity_provider USING btree (realm_id, enabled, link_only, hide_on_login, organization_id);


--
-- Name: idx_idp_realm_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_idp_realm_org ON public.identity_provider USING btree (realm_id, organization_id);


--
-- Name: idx_keycloak_role_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_keycloak_role_client ON public.keycloak_role USING btree (client);


--
-- Name: idx_keycloak_role_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_keycloak_role_realm ON public.keycloak_role USING btree (realm);


--
-- Name: idx_offline_uss_by_broker_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offline_uss_by_broker_session_id ON public.offline_user_session USING btree (broker_session_id, realm_id);


--
-- Name: idx_offline_uss_by_last_session_refresh; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offline_uss_by_last_session_refresh ON public.offline_user_session USING btree (realm_id, offline_flag, last_session_refresh);


--
-- Name: idx_offline_uss_by_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offline_uss_by_user ON public.offline_user_session USING btree (user_id, realm_id, offline_flag);


--
-- Name: idx_org_domain_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_domain_org_id ON public.org_domain USING btree (org_id);


--
-- Name: idx_perm_ticket_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_perm_ticket_owner ON public.resource_server_perm_ticket USING btree (owner);


--
-- Name: idx_perm_ticket_requester; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_perm_ticket_requester ON public.resource_server_perm_ticket USING btree (requester);


--
-- Name: idx_protocol_mapper_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_protocol_mapper_client ON public.protocol_mapper USING btree (client_id);


--
-- Name: idx_realm_attr_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_attr_realm ON public.realm_attribute USING btree (realm_id);


--
-- Name: idx_realm_clscope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_clscope ON public.client_scope USING btree (realm_id);


--
-- Name: idx_realm_def_grp_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_def_grp_realm ON public.realm_default_groups USING btree (realm_id);


--
-- Name: idx_realm_evt_list_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_evt_list_realm ON public.realm_events_listeners USING btree (realm_id);


--
-- Name: idx_realm_evt_types_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_evt_types_realm ON public.realm_enabled_event_types USING btree (realm_id);


--
-- Name: idx_realm_master_adm_cli; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_master_adm_cli ON public.realm USING btree (master_admin_client);


--
-- Name: idx_realm_supp_local_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_realm_supp_local_realm ON public.realm_supported_locales USING btree (realm_id);


--
-- Name: idx_redir_uri_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_redir_uri_client ON public.redirect_uris USING btree (client_id);


--
-- Name: idx_req_act_prov_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_req_act_prov_realm ON public.required_action_provider USING btree (realm_id);


--
-- Name: idx_res_policy_policy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_res_policy_policy ON public.resource_policy USING btree (policy_id);


--
-- Name: idx_res_scope_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_res_scope_scope ON public.resource_scope USING btree (scope_id);


--
-- Name: idx_res_serv_pol_res_serv; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_res_serv_pol_res_serv ON public.resource_server_policy USING btree (resource_server_id);


--
-- Name: idx_res_srv_res_res_srv; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_res_srv_res_res_srv ON public.resource_server_resource USING btree (resource_server_id);


--
-- Name: idx_res_srv_scope_res_srv; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_res_srv_scope_res_srv ON public.resource_server_scope USING btree (resource_server_id);


--
-- Name: idx_rev_token_on_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rev_token_on_expire ON public.revoked_token USING btree (expire);


--
-- Name: idx_role_attribute; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_attribute ON public.role_attribute USING btree (role_id);


--
-- Name: idx_role_clscope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_clscope ON public.client_scope_role_mapping USING btree (role_id);


--
-- Name: idx_scope_mapping_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scope_mapping_role ON public.scope_mapping USING btree (role_id);


--
-- Name: idx_scope_policy_policy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scope_policy_policy ON public.scope_policy USING btree (policy_id);


--
-- Name: idx_update_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_update_time ON public.migration_model USING btree (update_time);


--
-- Name: idx_usconsent_clscope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usconsent_clscope ON public.user_consent_client_scope USING btree (user_consent_id);


--
-- Name: idx_usconsent_scope_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usconsent_scope_id ON public.user_consent_client_scope USING btree (scope_id);


--
-- Name: idx_user_attribute; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_attribute ON public.user_attribute USING btree (user_id);


--
-- Name: idx_user_attribute_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_attribute_name ON public.user_attribute USING btree (name, value);


--
-- Name: idx_user_consent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_consent ON public.user_consent USING btree (user_id);


--
-- Name: idx_user_credential; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_credential ON public.credential USING btree (user_id);


--
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_email ON public.user_entity USING btree (email);


--
-- Name: idx_user_group_mapping; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_group_mapping ON public.user_group_membership USING btree (user_id);


--
-- Name: idx_user_reqactions; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_reqactions ON public.user_required_action USING btree (user_id);


--
-- Name: idx_user_role_mapping; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_role_mapping ON public.user_role_mapping USING btree (user_id);


--
-- Name: idx_user_service_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_service_account ON public.user_entity USING btree (realm_id, service_account_client_link);


--
-- Name: idx_usr_fed_map_fed_prv; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usr_fed_map_fed_prv ON public.user_federation_mapper USING btree (federation_provider_id);


--
-- Name: idx_usr_fed_map_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usr_fed_map_realm ON public.user_federation_mapper USING btree (realm_id);


--
-- Name: idx_usr_fed_prv_realm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usr_fed_prv_realm ON public.user_federation_provider USING btree (realm_id);


--
-- Name: idx_web_orig_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_web_orig_client ON public.web_origins USING btree (client_id);


--
-- Name: user_attr_long_values; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_attr_long_values ON public.user_attribute USING btree (long_value_hash, name);


--
-- Name: user_attr_long_values_lower_case; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_attr_long_values_lower_case ON public.user_attribute USING btree (long_value_hash_lower_case, name);


--
-- Name: identity_provider fk2b4ebc52ae5c3b34; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider
    ADD CONSTRAINT fk2b4ebc52ae5c3b34 FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: client_attributes fk3c47c64beacca966; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_attributes
    ADD CONSTRAINT fk3c47c64beacca966 FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: federated_identity fk404288b92ef007a6; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.federated_identity
    ADD CONSTRAINT fk404288b92ef007a6 FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: client_node_registrations fk4129723ba992f594; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_node_registrations
    ADD CONSTRAINT fk4129723ba992f594 FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: redirect_uris fk_1burs8pb4ouj97h5wuppahv9f; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.redirect_uris
    ADD CONSTRAINT fk_1burs8pb4ouj97h5wuppahv9f FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: user_federation_provider fk_1fj32f6ptolw2qy60cd8n01e8; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_provider
    ADD CONSTRAINT fk_1fj32f6ptolw2qy60cd8n01e8 FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: realm_required_credential fk_5hg65lybevavkqfki3kponh9v; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_required_credential
    ADD CONSTRAINT fk_5hg65lybevavkqfki3kponh9v FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: resource_attribute fk_5hrm2vlf9ql5fu022kqepovbr; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_attribute
    ADD CONSTRAINT fk_5hrm2vlf9ql5fu022kqepovbr FOREIGN KEY (resource_id) REFERENCES public.resource_server_resource(id);


--
-- Name: user_attribute fk_5hrm2vlf9ql5fu043kqepovbr; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_attribute
    ADD CONSTRAINT fk_5hrm2vlf9ql5fu043kqepovbr FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: user_required_action fk_6qj3w1jw9cvafhe19bwsiuvmd; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_required_action
    ADD CONSTRAINT fk_6qj3w1jw9cvafhe19bwsiuvmd FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: keycloak_role fk_6vyqfe4cn4wlq8r6kt5vdsj5c; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.keycloak_role
    ADD CONSTRAINT fk_6vyqfe4cn4wlq8r6kt5vdsj5c FOREIGN KEY (realm) REFERENCES public.realm(id);


--
-- Name: realm_smtp_config fk_70ej8xdxgxd0b9hh6180irr0o; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_smtp_config
    ADD CONSTRAINT fk_70ej8xdxgxd0b9hh6180irr0o FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: realm_attribute fk_8shxd6l3e9atqukacxgpffptw; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_attribute
    ADD CONSTRAINT fk_8shxd6l3e9atqukacxgpffptw FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: composite_role fk_a63wvekftu8jo1pnj81e7mce2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.composite_role
    ADD CONSTRAINT fk_a63wvekftu8jo1pnj81e7mce2 FOREIGN KEY (composite) REFERENCES public.keycloak_role(id);


--
-- Name: authentication_execution fk_auth_exec_flow; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authentication_execution
    ADD CONSTRAINT fk_auth_exec_flow FOREIGN KEY (flow_id) REFERENCES public.authentication_flow(id);


--
-- Name: authentication_execution fk_auth_exec_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authentication_execution
    ADD CONSTRAINT fk_auth_exec_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: authentication_flow fk_auth_flow_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authentication_flow
    ADD CONSTRAINT fk_auth_flow_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: authenticator_config fk_auth_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.authenticator_config
    ADD CONSTRAINT fk_auth_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: user_role_mapping fk_c4fqv34p1mbylloxang7b1q3l; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_role_mapping
    ADD CONSTRAINT fk_c4fqv34p1mbylloxang7b1q3l FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: client_scope_attributes fk_cl_scope_attr_scope; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope_attributes
    ADD CONSTRAINT fk_cl_scope_attr_scope FOREIGN KEY (scope_id) REFERENCES public.client_scope(id);


--
-- Name: client_scope_role_mapping fk_cl_scope_rm_scope; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_scope_role_mapping
    ADD CONSTRAINT fk_cl_scope_rm_scope FOREIGN KEY (scope_id) REFERENCES public.client_scope(id);


--
-- Name: protocol_mapper fk_cli_scope_mapper; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_mapper
    ADD CONSTRAINT fk_cli_scope_mapper FOREIGN KEY (client_scope_id) REFERENCES public.client_scope(id);


--
-- Name: client_initial_access fk_client_init_acc_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_initial_access
    ADD CONSTRAINT fk_client_init_acc_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: component_config fk_component_config; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.component_config
    ADD CONSTRAINT fk_component_config FOREIGN KEY (component_id) REFERENCES public.component(id);


--
-- Name: component fk_component_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.component
    ADD CONSTRAINT fk_component_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: realm_default_groups fk_def_groups_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_default_groups
    ADD CONSTRAINT fk_def_groups_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: user_federation_mapper_config fk_fedmapper_cfg; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_mapper_config
    ADD CONSTRAINT fk_fedmapper_cfg FOREIGN KEY (user_federation_mapper_id) REFERENCES public.user_federation_mapper(id);


--
-- Name: user_federation_mapper fk_fedmapperpm_fedprv; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_mapper
    ADD CONSTRAINT fk_fedmapperpm_fedprv FOREIGN KEY (federation_provider_id) REFERENCES public.user_federation_provider(id);


--
-- Name: user_federation_mapper fk_fedmapperpm_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_mapper
    ADD CONSTRAINT fk_fedmapperpm_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: associated_policy fk_frsr5s213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.associated_policy
    ADD CONSTRAINT fk_frsr5s213xcx4wnkog82ssrfy FOREIGN KEY (associated_policy_id) REFERENCES public.resource_server_policy(id);


--
-- Name: scope_policy fk_frsrasp13xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scope_policy
    ADD CONSTRAINT fk_frsrasp13xcx4wnkog82ssrfy FOREIGN KEY (policy_id) REFERENCES public.resource_server_policy(id);


--
-- Name: resource_server_perm_ticket fk_frsrho213xcx4wnkog82sspmt; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_perm_ticket
    ADD CONSTRAINT fk_frsrho213xcx4wnkog82sspmt FOREIGN KEY (resource_server_id) REFERENCES public.resource_server(id);


--
-- Name: resource_server_resource fk_frsrho213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_resource
    ADD CONSTRAINT fk_frsrho213xcx4wnkog82ssrfy FOREIGN KEY (resource_server_id) REFERENCES public.resource_server(id);


--
-- Name: resource_server_perm_ticket fk_frsrho213xcx4wnkog83sspmt; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_perm_ticket
    ADD CONSTRAINT fk_frsrho213xcx4wnkog83sspmt FOREIGN KEY (resource_id) REFERENCES public.resource_server_resource(id);


--
-- Name: resource_server_perm_ticket fk_frsrho213xcx4wnkog84sspmt; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_perm_ticket
    ADD CONSTRAINT fk_frsrho213xcx4wnkog84sspmt FOREIGN KEY (scope_id) REFERENCES public.resource_server_scope(id);


--
-- Name: associated_policy fk_frsrpas14xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.associated_policy
    ADD CONSTRAINT fk_frsrpas14xcx4wnkog82ssrfy FOREIGN KEY (policy_id) REFERENCES public.resource_server_policy(id);


--
-- Name: scope_policy fk_frsrpass3xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scope_policy
    ADD CONSTRAINT fk_frsrpass3xcx4wnkog82ssrfy FOREIGN KEY (scope_id) REFERENCES public.resource_server_scope(id);


--
-- Name: resource_server_perm_ticket fk_frsrpo2128cx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_perm_ticket
    ADD CONSTRAINT fk_frsrpo2128cx4wnkog82ssrfy FOREIGN KEY (policy_id) REFERENCES public.resource_server_policy(id);


--
-- Name: resource_server_policy fk_frsrpo213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_policy
    ADD CONSTRAINT fk_frsrpo213xcx4wnkog82ssrfy FOREIGN KEY (resource_server_id) REFERENCES public.resource_server(id);


--
-- Name: resource_scope fk_frsrpos13xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_scope
    ADD CONSTRAINT fk_frsrpos13xcx4wnkog82ssrfy FOREIGN KEY (resource_id) REFERENCES public.resource_server_resource(id);


--
-- Name: resource_policy fk_frsrpos53xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_policy
    ADD CONSTRAINT fk_frsrpos53xcx4wnkog82ssrfy FOREIGN KEY (resource_id) REFERENCES public.resource_server_resource(id);


--
-- Name: resource_policy fk_frsrpp213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_policy
    ADD CONSTRAINT fk_frsrpp213xcx4wnkog82ssrfy FOREIGN KEY (policy_id) REFERENCES public.resource_server_policy(id);


--
-- Name: resource_scope fk_frsrps213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_scope
    ADD CONSTRAINT fk_frsrps213xcx4wnkog82ssrfy FOREIGN KEY (scope_id) REFERENCES public.resource_server_scope(id);


--
-- Name: resource_server_scope fk_frsrso213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_server_scope
    ADD CONSTRAINT fk_frsrso213xcx4wnkog82ssrfy FOREIGN KEY (resource_server_id) REFERENCES public.resource_server(id);


--
-- Name: composite_role fk_gr7thllb9lu8q4vqa4524jjy8; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.composite_role
    ADD CONSTRAINT fk_gr7thllb9lu8q4vqa4524jjy8 FOREIGN KEY (child_role) REFERENCES public.keycloak_role(id);


--
-- Name: user_consent_client_scope fk_grntcsnt_clsc_usc; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_consent_client_scope
    ADD CONSTRAINT fk_grntcsnt_clsc_usc FOREIGN KEY (user_consent_id) REFERENCES public.user_consent(id);


--
-- Name: user_consent fk_grntcsnt_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_consent
    ADD CONSTRAINT fk_grntcsnt_user FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: group_attribute fk_group_attribute_group; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_attribute
    ADD CONSTRAINT fk_group_attribute_group FOREIGN KEY (group_id) REFERENCES public.keycloak_group(id);


--
-- Name: group_role_mapping fk_group_role_group; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_role_mapping
    ADD CONSTRAINT fk_group_role_group FOREIGN KEY (group_id) REFERENCES public.keycloak_group(id);


--
-- Name: realm_enabled_event_types fk_h846o4h0w8epx5nwedrf5y69j; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_enabled_event_types
    ADD CONSTRAINT fk_h846o4h0w8epx5nwedrf5y69j FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: realm_events_listeners fk_h846o4h0w8epx5nxev9f5y69j; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_events_listeners
    ADD CONSTRAINT fk_h846o4h0w8epx5nxev9f5y69j FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: identity_provider_mapper fk_idpm_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider_mapper
    ADD CONSTRAINT fk_idpm_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: idp_mapper_config fk_idpmconfig; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idp_mapper_config
    ADD CONSTRAINT fk_idpmconfig FOREIGN KEY (idp_mapper_id) REFERENCES public.identity_provider_mapper(id);


--
-- Name: web_origins fk_lojpho213xcx4wnkog82ssrfy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.web_origins
    ADD CONSTRAINT fk_lojpho213xcx4wnkog82ssrfy FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: scope_mapping fk_ouse064plmlr732lxjcn1q5f1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scope_mapping
    ADD CONSTRAINT fk_ouse064plmlr732lxjcn1q5f1 FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: protocol_mapper fk_pcm_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_mapper
    ADD CONSTRAINT fk_pcm_realm FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: credential fk_pfyr0glasqyl0dei3kl69r6v0; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credential
    ADD CONSTRAINT fk_pfyr0glasqyl0dei3kl69r6v0 FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: protocol_mapper_config fk_pmconfig; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_mapper_config
    ADD CONSTRAINT fk_pmconfig FOREIGN KEY (protocol_mapper_id) REFERENCES public.protocol_mapper(id);


--
-- Name: default_client_scope fk_r_def_cli_scope_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.default_client_scope
    ADD CONSTRAINT fk_r_def_cli_scope_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: required_action_provider fk_req_act_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.required_action_provider
    ADD CONSTRAINT fk_req_act_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: resource_uris fk_resource_server_uris; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_uris
    ADD CONSTRAINT fk_resource_server_uris FOREIGN KEY (resource_id) REFERENCES public.resource_server_resource(id);


--
-- Name: role_attribute fk_role_attribute_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_attribute
    ADD CONSTRAINT fk_role_attribute_id FOREIGN KEY (role_id) REFERENCES public.keycloak_role(id);


--
-- Name: realm_supported_locales fk_supported_locales_realm; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.realm_supported_locales
    ADD CONSTRAINT fk_supported_locales_realm FOREIGN KEY (realm_id) REFERENCES public.realm(id);


--
-- Name: user_federation_config fk_t13hpu1j94r2ebpekr39x5eu5; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_federation_config
    ADD CONSTRAINT fk_t13hpu1j94r2ebpekr39x5eu5 FOREIGN KEY (user_federation_provider_id) REFERENCES public.user_federation_provider(id);


--
-- Name: user_group_membership fk_user_group_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_group_membership
    ADD CONSTRAINT fk_user_group_user FOREIGN KEY (user_id) REFERENCES public.user_entity(id);


--
-- Name: policy_config fkdc34197cf864c4e43; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.policy_config
    ADD CONSTRAINT fkdc34197cf864c4e43 FOREIGN KEY (policy_id) REFERENCES public.resource_server_policy(id);


--
-- Name: identity_provider_config fkdc4897cf864c4e43; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.identity_provider_config
    ADD CONSTRAINT fkdc4897cf864c4e43 FOREIGN KEY (identity_provider_id) REFERENCES public.identity_provider(internal_id);


--
-- PostgreSQL database dump complete
--

