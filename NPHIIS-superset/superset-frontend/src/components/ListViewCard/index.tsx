/* eslint-disable theme-colors/no-literal-colors */
/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { ReactNode, ComponentType, ReactElement, FC } from 'react';
import { styled, useTheme } from '@superset-ui/core';
import { Skeleton, Card } from 'src/components';
import { Tooltip } from 'src/components/Tooltip';
import { ConfigProvider } from 'antd-v5';
import ImageLoader, { BackgroundPosition } from './ImageLoader';
import CertifiedBadge from '../CertifiedBadge';

const ActionsWrapper = styled.div`
  width: 64px;
  display: flex;
  justify-content: flex-end;
`;

// Styling part 1: Override Card tokens when possible
const listViewCardTheme = {
  components: {
    Card: {
      colorBgContainer: 'transparent',
      borderRadiusLG: 16,
      paddingLG: 0,
    },
  },
};

// Styling part 2: Use CSS when necessary
const StyledCard = styled(Card)`
  ${({ theme }) => `
    overflow: hidden;
    border-radius: 16px;
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 50%, #0050b3 100%);
    color: ${theme.colors.text.white};
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
    
    .gradient-container {
      position: relative;
      height: 100%;
      background: linear-gradient(135deg, rgba(24, 144, 255, 0.9) 0%, rgba(9, 109, 217, 0.9) 50%, rgba(0, 80, 179, 0.9) 100%);
    }

    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(24, 144, 255, 0.4);
      transition: all 0.3s ease;

      .cover-footer {
        transform: translateY(0);
      }
    }

    .ant-card-body {
      padding: 0;
    }

    .ant-card-cover {
      border-radius: 16px 16px 0 0;
    }
  `}
`;

const Cover = styled.div`
  height: 200px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  position: relative;

  .cover-footer {
    transform: translateY(${({ theme }) => theme.gridUnit * 9}px);
    transition: ${({ theme }) => theme.transitionTiming}s ease-out;
  }
`;

const TitleContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  padding: 24px 20px;

  .card-actions {
    margin-left: auto;
    align-self: flex-end;
    padding-left: ${({ theme }) => theme.gridUnit}px;
    span[role='img'] {
      display: flex;
      align-items: center;
    }
  }

  .titleRow {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-direction: row;
    color: white;
    margin-bottom: 8px;
  }

  .titleContent {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .titleTags {
    margin-top: 8px;
  }

  .antd5-card-meta-description {
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    line-height: 1.4;
    margin: 0;
    padding: 0 20px 20px 20px;
  }
`;

const TitleLink = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  flex: 1;

  & a {
    color: white;
    text-decoration: none;

    &:hover {
      color: white;
      text-decoration: none;
    }
  }
`;

const TitleRight = styled.div`
  font-weight: 400;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  margin-top: 8px;
`;

const CoverFooter = styled.div`
  display: flex;
  flex-wrap: nowrap;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.3) 0%, transparent 100%);
`;

const CoverFooterLeft = styled.div`
  flex: 1;
  overflow: hidden;
  color: white;
  font-size: 12px;
  font-weight: 500;
`;

const CoverFooterRight = styled.div`
  align-self: flex-end;
  margin-left: auto;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
`;

const ThinSkeleton = styled(Skeleton)`
  h3 {
    margin: ${({ theme }) => theme.gridUnit}px 0;
  }

  ul {
    margin-bottom: 0;
  }
`;

const paragraphConfig = { rows: 1, width: 150 };

interface LinkProps {
  to: string;
}

const AnchorLink: FC<LinkProps> = ({ to, children }) => (
  <a href={to}>{children}</a>
);

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  url?: string;
  linkComponent?: ComponentType<LinkProps>;
  imgURL?: string | null;
  imgFallbackURL?: string;
  imgPosition?: BackgroundPosition;
  description: string;
  loading?: boolean;
  titleRight?: ReactNode;
  coverLeft?: ReactNode;
  coverRight?: ReactNode;
  actions?: ReactNode | null;
  rows?: number | string;
  avatar?: ReactElement | null;
  cover?: ReactNode | null;
  certifiedBy?: string;
  certificationDetails?: string;
}

function ListViewCard({
  title,
  subtitle,
  url,
  linkComponent,
  titleRight,
  imgURL,
  imgFallbackURL,
  description,
  coverLeft,
  coverRight,
  actions,
  avatar,
  loading,
  imgPosition = 'top',
  cover,
  certifiedBy,
  certificationDetails,
}: CardProps) {
  const Link = url && linkComponent ? linkComponent : AnchorLink;
  const theme = useTheme();
  return (
    <ConfigProvider theme={listViewCardTheme}>
      <StyledCard
        data-test="styled-card"
        padded
        cover={
          cover || (
            <Cover>
              <Link to={url!}>
                <div className="gradient-container">
                  <ImageLoader
                    src={imgURL || ''}
                    fallback={imgFallbackURL || ''}
                    isLoading={loading}
                    position={imgPosition}
                  />
                </div>
              </Link>
              <CoverFooter className="cover-footer">
                {!loading && coverLeft && (
                  <CoverFooterLeft>{coverLeft}</CoverFooterLeft>
                )}
                {!loading && coverRight && (
                  <CoverFooterRight>{coverRight}</CoverFooterRight>
                )}
              </CoverFooter>
            </Cover>
          )
        }
      >
        {loading && (
          <Card.Meta
            title={
              <>
                <TitleContainer>
                  <Skeleton.Input
                    active
                    size="small"
                    css={{
                      width: Math.trunc(theme.gridUnit * 62.5),
                    }}
                  />
                  <div className="card-actions">
                    <Skeleton.Button active shape="circle" />{' '}
                    <Skeleton.Button
                      active
                      css={{
                        width: theme.gridUnit * 10,
                      }}
                    />
                  </div>
                </TitleContainer>
              </>
            }
            description={
              <ThinSkeleton
                round
                active
                title={false}
                paragraph={paragraphConfig}
              />
            }
          />
        )}
        {!loading && (
          <Card.Meta
            title={
              <TitleContainer>
                {subtitle || null}
                <div className="titleRow">
                  <div className="titleContent">
                    <Tooltip title={title}>
                      <TitleLink>
                        {certifiedBy && (
                          <>
                            <CertifiedBadge
                              certifiedBy={certifiedBy}
                              details={certificationDetails}
                            />{' '}
                          </>
                        )}
                        {title}
                      </TitleLink>
                    </Tooltip>
                    {titleRight && (
                      <div className="titleTags">
                        <TitleRight>{titleRight}</TitleRight>
                      </div>
                    )}
                  </div>
                  <div className="card-actions" data-test="card-actions">
                    {actions}
                  </div>
                </div>
              </TitleContainer>
            }
            description={description}
            avatar={avatar || null}
          />
        )}
      </StyledCard>
    </ConfigProvider>
  );
}

ListViewCard.Actions = ActionsWrapper;

export default ListViewCard;
