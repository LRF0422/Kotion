/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the GNU LESSER GENERAL PUBLIC LICENSE 3.0;
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.gnu.org/licenses/lgpl.html
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.core.secure.utils;

import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.utils.StringPool;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Static utility class for accessing the current user from Spring Security
 * context.
 * This is the replacement for SecureUtil's user-extraction methods.
 *
 * @author Knowledge
 */
public final class SecurityContextUtil {

    private SecurityContextUtil() {
        // Utility class, prevent instantiation
    }

    /**
     * Gets the current KnowledgeUser from the SecurityContext.
     *
     * @return the current KnowledgeUser, or null if not authenticated
     */
    public static KnowledgeUser getUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null) {
            return null;
        }

        // Check if it's our custom authentication type
        if (authentication instanceof KnowledgeUserAuthentication) {
            return ((KnowledgeUserAuthentication) authentication).getKnowledgeUser();
        }

        // Try to get from principal if it's a KnowledgeUser
        Object principal = authentication.getPrincipal();
        if (principal instanceof KnowledgeUser) {
            return (KnowledgeUser) principal;
        }

        return null;
    }

    /**
     * Gets the current user's ID.
     *
     * @return the user ID, or -1 if not authenticated
     */
    public static Long getUserId() {
        KnowledgeUser user = getUser();
        return (user == null || user.getUserId() == null) ? -1L : user.getUserId();
    }

    /**
     * Gets the current user's name.
     *
     * @return the user name, or empty string if not authenticated
     */
    public static String getUserName() {
        KnowledgeUser user = getUser();
        return (user == null || user.getUserName() == null) ? StringPool.EMPTY : user.getUserName();
    }

    /**
     * Gets the current user's account.
     *
     * @return the user account, or empty string if not authenticated
     */
    public static String getUserAccount() {
        KnowledgeUser user = getUser();
        return (user == null || user.getAccount() == null) ? StringPool.EMPTY : user.getAccount();
    }

    /**
     * Gets the current user's tenant ID.
     *
     * @return the tenant ID, or empty string if not authenticated
     */
    public static String getTenantId() {
        KnowledgeUser user = getUser();
        return (user == null || user.getTenantId() == null) ? StringPool.EMPTY : user.getTenantId();
    }

    /**
     * Gets the current user's role ID.
     *
     * @return the role ID, or empty string if not authenticated
     */
    public static String getRoleId() {
        KnowledgeUser user = getUser();
        return (user == null || user.getRoleId() == null) ? StringPool.EMPTY : user.getRoleId();
    }

    /**
     * Gets the current user's department ID.
     *
     * @return the department ID, or empty string if not authenticated
     */
    public static String getDeptId() {
        KnowledgeUser user = getUser();
        return (user == null || user.getDeptId() == null) ? StringPool.EMPTY : user.getDeptId();
    }

    /**
     * Gets the current user's client ID.
     *
     * @return the client ID, or empty string if not authenticated
     */
    public static String getClientId() {
        KnowledgeUser user = getUser();
        return (user == null || user.getClientId() == null) ? StringPool.EMPTY : user.getClientId();
    }

    /**
     * Gets the current user's role name.
     *
     * @return the role name, or empty string if not authenticated
     */
    public static String getRoleName() {
        KnowledgeUser user = getUser();
        return (user == null || user.getRoleName() == null) ? StringPool.EMPTY : user.getRoleName();
    }

    /**
     * Gets the current user's role (alias for getRoleName).
     *
     * @return the role name, or empty string if not authenticated
     */
    public static String getUserRole() {
        return getRoleName();
    }

    /**
     * Gets the current user's install app ID.
     *
     * @return the current install app ID, or null if not authenticated
     */
    public static Long getCurrentAppId() {
        KnowledgeUser user = getUser();
        return (user == null) ? null : user.getCurrentInstallAppId();
    }

    /**
     * Checks if the current user is authenticated.
     *
     * @return true if authenticated, false otherwise
     */
    public static boolean isAuthenticated() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.isAuthenticated();
    }

    /**
     * Gets the raw JWT token from the current authentication.
     *
     * @return the JWT token, or null if not available
     */
    public static String getToken() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication instanceof KnowledgeUserAuthentication) {
            Object credentials = authentication.getCredentials();
            return credentials != null ? credentials.toString() : null;
        }

        return null;
    }
}
