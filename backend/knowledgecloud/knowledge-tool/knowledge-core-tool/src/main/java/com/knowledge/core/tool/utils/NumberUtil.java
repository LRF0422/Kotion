/**
 * Copyright (c) 2018-2028, DreamLu 卢春梦 (qq596392912@gmail.com).
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
package com.knowledge.core.tool.utils;


import org.springframework.lang.Nullable;

/**
 * 数字类型工具类
 *
 * @author L.cm
 */
public class NumberUtil extends org.springframework.util.NumberUtils {

	//-----------------------------------------------------------------------

	/**
	 * <p>Convert a <code>String</code> to an <code>int</code>, returning
	 * <code>zero</code> if the conversion fails.</p>
	 *
	 * <p>If the string is <code>null</code>, <code>zero</code> is returned.</p>
	 *
	 * <pre>
	 *   NumberUtil.toInt(null) = 0
	 *   NumberUtil.toInt("")   = 0
	 *   NumberUtil.toInt("1")  = 1
	 * </pre>
	 *
	 * @param str the string to convert, may be null
	 * @return the int represented by the string, or <code>zero</code> if
	 * conversion fails
	 */
	public static int toInt(final String str) {
		return toInt(str, -1);
	}

	/**
	 * <p>Convert a <code>String</code> to an <code>int</code>, returning a
	 * default value if the conversion fails.</p>
	 *
	 * <p>If the string is <code>null</code>, the default value is returned.</p>
	 *
	 * <pre>
	 *   NumberUtil.toInt(null, 1) = 1
	 *   NumberUtil.toInt("", 1)   = 1
	 *   NumberUtil.toInt("1", 0)  = 1
	 * </pre>
	 *
	 * @param str          the string to convert, may be null
	 * @param defaultValue the default value
	 * @return the int represented by the string, or the default if conversion fails
	 */
	public static int toInt(@Nullable final String str, final int defaultValue) {
		if (str == null) {
			return defaultValue;
		}
		try {
			return Integer.valueOf(str);
		} catch (final NumberFormatException nfe) {
			return defaultValue;
		}
	}

	/**
	 * <p>Convert a <code>String</code> to a <code>long</code>, returning
	 * <code>zero</code> if the conversion fails.</p>
	 *
	 * <p>If the string is <code>null</code>, <code>zero</code> is returned.</p>
	 *
	 * <pre>
	 *   NumberUtil.toLong(null) = 0L
	 *   NumberUtil.toLong("")   = 0L
	 *   NumberUtil.toLong("1")  = 1L
	 * </pre>
	 *
	 * @param str the string to convert, may be null
	 * @return the long represented by the string, or <code>0</code> if
	 * conversion fails
	 */
	public static long toLong(final String str) {
		return toLong(str, 0L);
	}

	/**
	 * <p>Convert a <code>String</code> to a <code>long</code>, returning a
	 * default value if the conversion fails.</p>
	 *
	 * <p>If the string is <code>null</code>, the default value is returned.</p>
	 *
	 * <pre>
	 *   NumberUtil.toLong(null, 1L) = 1L
	 *   NumberUtil.toLong("", 1L)   = 1L
	 *   NumberUtil.toLong("1", 0L)  = 1L
	 * </pre>
	 *
	 * @param str          the string to convert, may be null
	 * @param defaultValue the default value
	 * @return the long represented by the string, or the default if conversion fails
	 */
	public static long toLong(@Nullable final String str, final long defaultValue) {
		if (str == null) {
			return defaultValue;
		}
		try {
			return Long.valueOf(str);
		} catch (final NumberFormatException nfe) {
			return defaultValue;
		}
	}

	/**
	 * <p>Convert a <code>String</code> to a <code>Double</code>
	 *
	 * @param value value
	 * @return double value
	 */
	public static Double toDouble(String value) {
		return toDouble(value, null);
	}

	/**
	 * <p>Convert a <code>String</code> to a <code>Double</code>
	 *
	 * @param value value
	 * @param defaultValue 默认值
	 * @return double value
	 */
	public static Double toDouble(@Nullable String value, Double defaultValue) {
		if (value != null) {
			return Double.valueOf(value.trim());
		}
		return defaultValue;
	}

	/**
	 * <p>Convert a <code>String</code> to a <code>Double</code>
	 *
	 * @param value value
	 * @return double value
	 */
	public static Float toFloat(String value) {
		return toFloat(value, null);
	}

	/**
	 * <p>Convert a <code>String</code> to a <code>Double</code>
	 *
	 * @param value value
	 * @param defaultValue 默认值
	 * @return double value
	 */
	public static Float toFloat(@Nullable String value, Float defaultValue) {
		if (value != null) {
			return Float.valueOf(value.trim());
		}
		return defaultValue;
	}

	/**
	 * All possible chars for representing a number as a String
	 */
	private final static char[] DIGITS = {
		'0', '1', '2', '3', '4', '5',
		'6', '7', '8', '9', 'a', 'b',
		'c', 'd', 'e', 'f', 'g', 'h',
		'i', 'j', 'k', 'l', 'm', 'n',
		'o', 'p', 'q', 'r', 's', 't',
		'u', 'v', 'w', 'x', 'y', 'z',
		'A', 'B', 'C', 'D', 'E', 'F',
		'G', 'H', 'I', 'J', 'K', 'L',
		'M', 'N', 'O', 'P', 'Q', 'R',
		'S', 'T', 'U', 'V', 'W', 'X',
		'Y', 'Z'
	};

	/**
	 * 将 long 转短字符串 为 62 进制
	 *
	 * @param i 数字
	 * @return 短字符串
	 */
	public static String to62String(long i) {
		int radix = DIGITS.length;
		char[] buf = new char[65];
		int charPos = 64;
		i = -i;
		while (i <= -radix) {
			buf[charPos--] = DIGITS[(int) (-(i % radix))];
			i = i / radix;
		}
		buf[charPos] = DIGITS[(int) (-i)];

		return new String(buf, charPos, (65 - charPos));
	}

	public static boolean isNumber(CharSequence str) {
		if (StringUtil.isBlank(str)) {
			return false;
		}
		char[] chars = str.toString().toCharArray();
		int sz = chars.length;
		boolean hasExp = false;
		boolean hasDecPoint = false;
		boolean allowSigns = false;
		boolean foundDigit = false;
		// deal with any possible sign up front
		int start = (chars[0] == '-' || chars[0] == '+') ? 1 : 0;
		if (sz > start + 1) {
			if (chars[start] == '0' && (chars[start + 1] == 'x' || chars[start + 1] == 'X')) {
				int i = start + 2;
				if (i == sz) {
					return false; // str == "0x"
				}
				// checking hex (it can't be anything else)
				for (; i < chars.length; i++) {
					if ((chars[i] < '0' || chars[i] > '9') && (chars[i] < 'a' || chars[i] > 'f') && (chars[i] < 'A' || chars[i] > 'F')) {
						return false;
					}
				}
				return true;
			}
		}
		sz--; // don't want to loop to the last char, check it afterwords
		// for type qualifiers
		int i = start;
		// loop to the next to last char or to the last char if we need another digit to
		// make a valid number (e.g. chars[0..5] = "1234E")
		while (i < sz || (i < sz + 1 && allowSigns && !foundDigit)) {
			if (chars[i] >= '0' && chars[i] <= '9') {
				foundDigit = true;
				allowSigns = false;

			} else if (chars[i] == '.') {
				if (hasDecPoint || hasExp) {
					// two decimal points or dec in exponent
					return false;
				}
				hasDecPoint = true;
			} else if (chars[i] == 'e' || chars[i] == 'E') {
				// we've already taken care of hex.
				if (hasExp) {
					// two E's
					return false;
				}
				if (false == foundDigit) {
					return false;
				}
				hasExp = true;
				allowSigns = true;
			} else if (chars[i] == '+' || chars[i] == '-') {
				if (!allowSigns) {
					return false;
				}
				allowSigns = false;
				foundDigit = false; // we need a digit after the E
			} else {
				return false;
			}
			i++;
		}
		if (i < chars.length) {
			if (chars[i] >= '0' && chars[i] <= '9') {
				// no type qualifier, OK
				return true;
			}
			if (chars[i] == 'e' || chars[i] == 'E') {
				// can't have an E at the last byte
				return false;
			}
			if (chars[i] == '.') {
				if (hasDecPoint || hasExp) {
					// two decimal points or dec in exponent
					return false;
				}
				// single trailing decimal point after non-exponent is ok
				return foundDigit;
			}
			if (!allowSigns && (chars[i] == 'd' || chars[i] == 'D' || chars[i] == 'f' || chars[i] == 'F')) {
				return foundDigit;
			}
			if (chars[i] == 'l' || chars[i] == 'L') {
				// not allowing L with an exponent
				return foundDigit && !hasExp;
			}
			// last character is illegal
			return false;
		}
		// allowSigns is true iff the val ends in 'E'
		// found digit it to make sure weird stuff like '.' and '1E-' doesn't pass
		return false == allowSigns && foundDigit;
	}

}
