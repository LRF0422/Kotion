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
package com.knowledge.core.secure.auth;

import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.utils.Func;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Custom Spring Security Authentication implementation that wraps
 * KnowledgeUser.
 * This authentication object is used to integrate the existing KnowledgeUser
 * model
 * with Spring Security's authentication system.
 *
 * @author Knowledge
 */
public class KnowledgeUserAuthentication implements Authentication {

    private static final long serialVersionUID = 1L;

    /**
     * The wrapped KnowledgeUser principal
     */
    private final KnowledgeUser knowledgeUser;

    /**
     * The raw JWT token string
     */
    private final String credentials;

    /**
     * Whether this authentication is authenticated
     */
    private boolean authenticated;

    /**
     * The granted authorities derived from user roles
     */
    private final Collection<GrantedAuthority> authorities;

    /**
     * Constructs a KnowledgeUserAuthentication with the given user and token.
     *
     * @param knowledgeUser the KnowledgeUser principal
     * @param token         the raw JWT token string
     */
    public KnowledgeUserAuthentication(KnowledgeUser knowledgeUser, String token) {
        this.knowledgeUser = knowledgeUser;
        this.credentials = token;
        this.authenticated = knowledgeUser != null;
        this.authorities = buildAuthorities(knowledgeUser);
    }

    /**
     * Builds the list of GrantedAuthority from the user's role names.
     *
     * @param user the KnowledgeUser
     * @return collection of GrantedAuthority
     */
    private Collection<GrantedAuthority> buildAuthorities(KnowledgeUser user) {
        List<GrantedAuthority> authorityList = new ArrayList<>();
        if (user != null && user.getRoleName() != null) {
            String roleName = user.getRoleName();
            // Role names may be comma-separated
            String[] roles = Func.toStrArray(roleName);
            for (String role : roles) {
                if (role != null && !role.trim().isEmpty()) {
                    // Add ROLE_ prefix if not present (Spring Security convention)
                    String roleStr = role.trim();
                    if (!roleStr.startsWith("ROLE_")) {
                        roleStr = "ROLE_" + roleStr;
                    }
                    authorityList.add(new SimpleGrantedAuthority(roleStr));
                }
            }
        }
        return authorityList;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    /**
     * Returns the raw JWT token string.
     *
     * @return the JWT token
     */
    @Override
    public Object getCredentials() {
        return credentials;
    }

    /**
     * Returns additional details (not used, returns null).
     *
     * @return null
     */
    @Override
    public Object getDetails() {
        return null;
    }

    /**
     * Returns the KnowledgeUser as the principal.
     *
     * @return the KnowledgeUser
     */
    @Override
    public Object getPrincipal() {
        return knowledgeUser;
    }

    @Override
    public boolean isAuthenticated() {
        return authenticated;
    }

    @Override
    public void setAuthenticated(boolean isAuthenticated) throws IllegalArgumentException {
        this.authenticated = isAuthenticated;
    }

    /**
     * Returns the user's account/username.
     *
     * @return the user account, or empty string if user is null
     */
    @Override
    public String getName() {
        return knowledgeUser != null ? knowledgeUser.getAccount() : "";
    }

    /**
     * Gets the KnowledgeUser directly.
     *
     * @return the KnowledgeUser
     */
    public KnowledgeUser getKnowledgeUser() {
        return knowledgeUser;
    }
}
